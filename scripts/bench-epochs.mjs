import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createWalletClient, encodeFunctionData, http, parseAbi, keccak256, toHex } from '../node/node_modules/viem/_esm/index.js';
import { mnemonicToAccount, privateKeyToAccount } from '../node/node_modules/viem/_esm/accounts/index.js';
import { encodePayments, epochTypes, epochDomain } from '../node/dist/epochs.js';

const outputDir = process.argv.find(arg => arg.startsWith('--output='))?.slice(9) ?? 'bench';
const rpcUrl = 'http://127.0.0.1:8545';
const chain = { id: 31337, name: 'Anvil', nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: [rpcUrl] } } };
const relayer = mnemonicToAccount('test test test test test test test test test test test junk', { addressIndex: 1 });
const wallet = createWalletClient({ account: relayer, chain, transport: http(rpcUrl) });
const gasPrice = 2_000_000_000n;
const zero = '0x0000000000000000000000000000000000000000';
const hex = value => '0x' + BigInt(value).toString(16);
const accountKey = index => '0x' + BigInt(0x200000 + index).toString(16).padStart(64, '0');
const recipient = index => '0x' + BigInt(0x50000 + index).toString(16).padStart(40, '0');
const tokenAbi = parseAbi([
  'function transfer(address to,uint256 amount) returns (bool)',
  'function balanceOf(address owner) view returns (uint256)',
]);
const epochAbi = parseAbi([
  'struct Epoch { address asset; bytes32 recipientsHash; bytes32 paymentsHash; uint256 feeCap; uint192 nonceKey; uint64 nonceSeq; uint64 deadline; }',
  'struct Submission { address account; Epoch epoch; address[] recipients; bytes payments; bytes signature; uint256 fee; }',
  'function settle(Submission[] submissions)',
  'event EpochRecorded(address indexed account, bytes32 indexed epochHash, bytes32 accumulator)',
]);
let requestId = 0;

async function rpc(method, ...params) {
  const response = await fetch(rpcUrl, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: ++requestId, method, params }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`${method}: HTTP ${response.status}`);
  const { result, error } = await response.json();
  if (error) throw new Error(`${method}: ${error.message}`);
  return result;
}

async function receipt(hash, stage) {
  let value;
  for (let attempt = 0; attempt < 300; ++attempt) {
    value = await rpc('eth_getTransactionReceipt', hash);
    if (value) break;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  assert.equal(value?.status, '0x1', `Failed or unmined ${stage} ${hash}`);
  const tx = await rpc('eth_getTransactionByHash', hash);
  const data = Buffer.from(tx.input.slice(2), 'hex');
  return { hash, stage, gas: Number(BigInt(value.gasUsed)), effectiveGasPrice: String(BigInt(value.effectiveGasPrice)), l1Fee: value.l1Fee ?? null,
    feeWei: String(BigInt(value.gasUsed) * BigInt(value.effectiveGasPrice) + BigInt(value.l1Fee ?? 0)),
    bytes: data.length, zeroBytes: data.filter(byte => byte === 0).length, block: Number(BigInt(value.blockNumber)),
    from: tx.from, contractAddress: value.contractAddress, logs: value.logs };
}

async function send(from, to, value = 0n, data = '0x', stage = 'settlement') {
  const hash = await rpc('eth_sendTransaction', {
    from, ...(to ? { to } : {}), value: hex(value), data, gas: hex(29_000_000), gasPrice: hex(gasPrice),
  });
  return receipt(hash, stage);
}

async function deployArtifact(from, file, args = '') {
  const artifact = JSON.parse(readFileSync(file, 'utf8'));
  return send(from, undefined, 0n, artifact.bytecode.object + args, 'deployment');
}

async function fixture() {
  const [treasury] = await rpc('eth_accounts');
  const token = await deployArtifact(treasury, 'out/BenchToken.sol/BenchToken.json');
  return { treasury, token: token.contractAddress, tokenDeployment: token };
}

async function deployEpoch(treasury) {
  const implementation = await deployArtifact(treasury, 'out/EpochAccount.sol/EpochAccount.json');
  const settler = await deployArtifact(treasury, 'out/EpochSettler.sol/EpochSettler.json',
    implementation.contractAddress.slice(2).padStart(64, '0'));
  return { implementation, settler };
}

function sum(rows) {
  return {
    gas: rows.reduce((total, row) => total + row.gas, 0),
    feeWei: rows.reduce((total, row) => total + BigInt(row.feeWei), 0n).toString(),
    bytes: rows.reduce((total, row) => total + row.bytes, 0),
    transactions: rows.length,
  };
}
const savings = (cost, baseline) => (100 * (1 - cost / baseline)).toFixed(2);

async function main() {
  assert.equal(await rpc('eth_chainId'), '0x7a69');
  execFileSync('forge', ['build'], { stdio: ['ignore', 'ignore', 'inherit'], timeout: 60_000 });
  const scenarios = [
    { name: 'fresh-unique', payers: 1, paymentsPerPayer: 100, payees: 100, assignedPayee: false },
    { name: 'fresh-distinct-payers', payers: 100, paymentsPerPayer: 1, payees: 10, assignedPayee: true },
    { name: 'one-payer-1000', payers: 1, paymentsPerPayer: 1000, payees: 10, assignedPayee: false },
    { name: 'one-payer-10000', payers: 1, paymentsPerPayer: 10000, payees: 10, assignedPayee: false },
    { name: 'hundred-payers-10000', payers: 100, paymentsPerPayer: 100, payees: 10, assignedPayee: true },
  ];
  const selected = process.argv.find(arg => arg.startsWith('--scenario='))?.split('=')[1];
  if (selected && !scenarios.some(scenario => scenario.name === selected)) throw new Error('Unknown scenario');
  const results = [];
  for (const scenario of scenarios.filter(scenario => !selected || scenario.name === selected)) {
    for (const asset of ['native', 'token']) {
      const outer = await rpc('evm_snapshot');
      try {
        const { treasury, token, tokenDeployment } = await fixture();
        const wallets = Array.from({ length: scenario.payers }, (_, index) => privateKeyToAccount(accountKey(index)));
        const payments = wallets.map((_, payer) => Array.from({ length: scenario.paymentsPerPayer }, (_, index) => ({
          to: recipient(scenario.assignedPayee ? payer % scenario.payees : index % scenario.payees),
          amount: BigInt(index % 100 + 1),
        })));
        const totals = new Map(Array.from({ length: scenario.payees }, (_, index) => [recipient(index).toLowerCase(), 0n]));
        const setup = asset === 'token' ? [tokenDeployment] : [];
        for (const [index, account] of wallets.entries()) {
          await rpc('anvil_setBalance', account.address, hex(10n ** 20n));
          if (asset === 'token') {
            const amount = payments[index].reduce((total, payment) => total + payment.amount, 0n);
            setup.push(await send(treasury, token, 0n, encodeFunctionData({
              abi: tokenAbi, functionName: 'transfer', args: [account.address, amount],
            }), 'funding'));
          }
          for (const payment of payments[index]) {
            totals.set(payment.to.toLowerCase(), totals.get(payment.to.toLowerCase()) + payment.amount);
          }
        }
        const balance = async address => BigInt(asset === 'native'
          ? await rpc('eth_getBalance', address, 'latest')
          : await rpc('eth_call', { to: token, data: encodeFunctionData({
            abi: tokenAbi, functionName: 'balanceOf', args: [address],
          }) }, 'latest'));
        async function verify() {
          const actual = [];
          for (const [address, expected] of totals) {
            const value = await balance(address);
            assert.equal(value, expected, `Final recipient balance ${address}`);
            actual.push(value.toString());
          }
          return actual;
        }

        const baselineSnapshot = await rpc('evm_snapshot');
        const direct = [];
        console.log(`Starting ${scenario.name}/${asset}`);
        for (const [index, account] of wallets.entries()) {
          await rpc('anvil_impersonateAccount', account.address);
          for (const payment of payments[index]) {
            direct.push(asset === 'native' ? await send(account.address, payment.to, payment.amount)
              : await send(account.address, token, 0n, encodeFunctionData({
                abi: tokenAbi, functionName: 'transfer', args: [payment.to, payment.amount],
              })));
          }
          await rpc('anvil_stopImpersonatingAccount', account.address);
          if (scenario.payers > 1 && (index + 1) % 20 === 0) console.log(`P0 completed for ${index + 1}/${wallets.length} payers`);
        }
        console.log(`P0 complete: ${scenario.name}/${asset}, ${direct.length} receipts`);
        const directBalances = await verify();
        for (const [index, account] of wallets.entries()) {
          const principal = asset === 'native' ? payments[index].reduce((sum, payment) => sum + payment.amount, 0n) : 0n;
          const spent = direct.filter(tx => tx.from.toLowerCase() === account.address.toLowerCase())
            .reduce((sum, tx) => sum + BigInt(tx.feeWei), 0n);
          assert.equal(BigInt(await rpc('eth_getBalance', account.address, 'latest')), 10n ** 20n - principal - spent,
            'P0 payer principal plus its receipt-derived gas');
        }
        assert(await rpc('evm_revert', baselineSnapshot));

        const deployment = await deployEpoch(treasury);
        const authorizationList = await Promise.all(wallets.map(account => account.signAuthorization({
          contractAddress: deployment.implementation.contractAddress, chainId: 31337, nonce: 0,
        })));
        const delegationHash = await wallet.sendTransaction({
          to: relayer.address, authorizationList, gas: 29_000_000n,
          maxFeePerGas: gasPrice, maxPriorityFeePerGas: gasPrice / 2n,
        });
        const delegation = await receipt(delegationHash, 'delegation');
        const submissions = await Promise.all(wallets.map(async (account, index) => {
          const packed = encodePayments(payments[index]);
          const epoch = {
            asset: asset === 'native' ? zero : token, recipientsHash: packed.recipientsHash,
            paymentsHash: packed.paymentsHash, feeCap: 0n, nonceKey: 0n, nonceSeq: 0n, deadline: (1n << 64n) - 1n,
          };
          const signature = await account.signTypedData({
            domain: epochDomain(31337, account.address), types: epochTypes, primaryType: 'Epoch', message: epoch,
          });
          return { account: account.address, epoch, recipients: packed.recipients, payments: packed.data, signature, fee: 0n };
        }));
        const execution = await send(relayer.address, deployment.settler.contractAddress, 0n,
          encodeFunctionData({ abi: epochAbi, functionName: 'settle', args: [submissions] }));
        const trace = await rpc('debug_traceTransaction', execution.hash, { tracer: 'callTracer' });
        let signatureGas = 0;
        let signatureChecks = 0;
        function visit(frame) {
          if (frame.to?.toLowerCase() === '0x0000000000000000000000000000000000000001') {
            signatureGas += Number(BigInt(frame.gasUsed)); signatureChecks++;
          }
          for (const child of frame.calls ?? []) visit(child);
        }
        visit(trace);
        assert.equal(signatureChecks, wallets.length, 'One actual ecrecover per payer epoch');
        assert.deepEqual(await verify(), directBalances);
        assert.equal(execution.logs.filter(log => log.address.toLowerCase() === deployment.settler.contractAddress.toLowerCase() &&
          log.topics[0] === keccak256(toHex('EpochRecorded(address,bytes32,bytes32)'))).length,
          wallets.length, 'One successful receipt per payer');
        assert.equal(await rpc('eth_getBalance', deployment.settler.contractAddress, 'latest'), '0x0');
        for (const [index, account] of wallets.entries()) {
          const principal = asset === 'native' ? payments[index].reduce((sum, payment) => sum + payment.amount, 0n) : 0n;
          assert.equal(BigInt(await rpc('eth_getBalance', account.address, 'latest')), 10n ** 20n - principal, 'Epoch payer principal');
          assert.equal(await rpc('eth_call', { to: token, data: encodeFunctionData({
            abi: tokenAbi, functionName: 'balanceOf', args: [account.address],
          }) }, 'latest'), '0x' + '0'.repeat(64));
        }

        const base = sum(direct);
        const steady = sum([execution]);
        const cold = sum([deployment.implementation, deployment.settler, delegation, execution]);
        const shared = sum(setup);
        const record = {
          scenario, asset, payments: direct.length, signatureGas, signatureChecks, baseline: base, steady, cold, sharedSetup: shared,
          settlementSavingPercent: savings(steady.gas, base.gas),
          coldSavingPercent: savings(cold.gas, base.gas),
          allInSavingPercent: savings(cold.gas + shared.gas, base.gas + shared.gas),
          finalBalances: directBalances,
          receipts: { direct, epoch: [deployment.implementation, deployment.settler, delegation, execution], setup },
        };
        results.push(record);
        mkdirSync(outputDir, { recursive: true });
        writeFileSync(`${outputDir}/epoch-progress.json`, JSON.stringify(results, null, 2) + '\n');
        console.log(`${scenario.name}/${asset}: P0 ${base.gas}, epoch ${steady.gas}, all-in saving ${record.allInSavingPercent}%`);
      } finally {
        assert(await rpc('evm_revert', outer));
      }
    }
  }
  mkdirSync(outputDir, { recursive: true });
  writeFileSync(`${outputDir}/epoch-results.json`, JSON.stringify(results, null, 2) + '\n');
  const lines = [
    '# Compact signed settlement epochs', '',
    'Measured on local Anvil, Prague. Every baseline payment is a separate mined transaction.',
    'Each payer explicitly signs an entire settlement window. Every original payment remains in transaction calldata.',
    'The account computes recipient totals on-chain. Recipients receive consolidated transfers at window settlement.',
    'Receipt checks assert matching final wallet balances. Intermediate spendability and per-payment event counts differ.',
    'Steady cost includes execution and signature verification. Cold cost adds all protocol deployment and delegation.',
    'All-in savings also include the same token fixture deployment and payer funding on both sides.',
    'The trial uses zero relayer reimbursement. Network gas is still paid by the relayer and counted.',
    'Initial native balances are fixtures, set equally for both paths. No off-chain operating costs are priced.', '',
    '| Workload | Asset | Payments | P0 gas | Epoch gas | Cold gas | Settlement saving | All-in saving |',
    '| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |',
    ...results.map(row => `| ${row.scenario.name} | ${row.asset} | ${row.payments} | ${row.baseline.gas} | ${row.steady.gas} | ${row.cold.gas} | ${row.settlementSavingPercent}% | ${row.allInSavingPercent}% |`),
  ];
  writeFileSync(`${outputDir}/epoch-results.md`, lines.join('\n') + '\n');
}
await main();
