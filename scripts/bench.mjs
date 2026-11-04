import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const rpcUrl = 'http://127.0.0.1:8545';
const mnemonic = 'test test test test test test test test test test test junk';
const gasPrice = 2_000_000_000n;
const gasLimit = '0x989680';
const quantity = value => '0x' + value.toString(16);
const word = value => BigInt(value).toString(16).padStart(64, '0');
let requestId = 0;

async function rpc(method, ...params) {
  const response = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: ++requestId, method, params }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`${method}: HTTP ${response.status}`);
  const { result, error } = await response.json();
  if (error) throw new Error(`${method}: ${error.message}`);
  return result;
}

const signatures = {
  transfer: 'transfer(address,uint256)',
  approve: 'approve(address,uint256)',
  balance: 'balanceOf(address)',
  native: 'payNative(address[],uint256[])',
  token: 'payToken(address,address[],uint256[])',
  publish: 'publish(bytes32)',
  claim: 'claim(uint256,uint256,address,uint256,bytes32[])',
};
const selector = Object.fromEntries(Object.entries(signatures).map(([key, signature]) =>
  [key, execFileSync('cast', ['sig', signature], { encoding: 'utf8' }).trim()]));
const callData = (method, ...args) => selector[method] + args.map(word).join('');

function payoutData(asset, token, payouts) {
  const addressArray = [payouts.length, ...payouts.map(payout => payout.to)];
  const amountArray = [payouts.length, ...payouts.map(payout => payout.amount)];
  const offset = asset === 'native' ? 64 : 96;
  const prefix = asset === 'native' ? [] : [token];
  return callData(asset, ...prefix, offset, offset + addressArray.length * 32, ...addressArray, ...amountArray);
}

async function measure(hash, stage) {
  let receipt;
  for (let attempt = 0; attempt < 100; ++attempt) {
    receipt = await rpc('eth_getTransactionReceipt', hash);
    if (receipt) break;
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  assert.equal(receipt?.status, '0x1', `Transaction failed or was not mined: ${hash}`);
  const transaction = await rpc('eth_getTransactionByHash', hash);
  const input = Buffer.from(transaction.input.slice(2), 'hex');
  const zeroBytes = input.filter(byte => byte === 0).length;
  const fee = BigInt(receipt.gasUsed) * BigInt(receipt.effectiveGasPrice) + BigInt(receipt.l1Fee ?? 0);
  return {
    stage, hash, from: transaction.from, to: transaction.to,
    gasUsed: Number(BigInt(receipt.gasUsed)),
    effectiveGasPrice: BigInt(receipt.effectiveGasPrice).toString(),
    ...(receipt.l1Fee == null ? {} : { l1Fee: BigInt(receipt.l1Fee).toString() }),
    feeWei: fee.toString(),
    calldataBytes: input.length,
    zeroBytes,
    nonzeroBytes: input.length - zeroBytes,
    block: Number(BigInt(receipt.blockNumber)),
    contractAddress: receipt.contractAddress,
  };
}

async function send(from, to, { value = 0n, data = '0x', stage = 'settlement' } = {}) {
  const hash = await rpc('eth_sendTransaction', {
    from, to, value: quantity(value), data, gas: gasLimit, gasPrice: quantity(gasPrice),
  });
  return measure(hash, stage);
}

async function deploy(asset, path) {
  const names = [];
  if (asset === 'token') names.push('BenchToken');
  if (path === 'P1' || path === 'P1-net') names.push('BatchPayout');
  if (path === 'P2') names.push('ClaimSettlement');
  if (!names.length) return { addresses: {}, receipts: [] };

  execFileSync('forge', [
    'script', 'script/Bench.s.sol:Bench', '--sig', 'run(bool,bool,bool)',
    String(names.includes('BenchToken')), String(names.includes('BatchPayout')),
    String(names.includes('ClaimSettlement')), '--rpc-url', rpcUrl, '--broadcast',
    '--mnemonic', mnemonic, '--legacy', '--with-gas-price', gasPrice.toString(),
  ], { stdio: ['ignore', 'ignore', 'inherit'] });
  const { transactions } = JSON.parse(readFileSync('broadcast/Bench.s.sol/31337/run-latest.json', 'utf8'));
  const receipts = await Promise.all(transactions.map(tx => measure(tx.hash, 'deployment')));
  assert.deepEqual(transactions.map(tx => tx.contractName), names);
  return {
    addresses: Object.fromEntries(names.map((name, index) => [name, receipts[index].contractAddress])),
    receipts,
  };
}

async function merkle(payments) {
  const size = 128;
  const nodes = Array(size * 2).fill('0x' + word(0));
  const hash = input => rpc('web3_sha3', input);
  await Promise.all(payments.map(async ({ to, amount }, index) => {
    nodes[size + index] = await hash(await hash('0x' + word(index) + word(to) + word(amount)));
  }));
  for (let level = size / 2; level >= 1; level /= 2) {
    await Promise.all(Array.from({ length: level }, async (_, offset) => {
      const index = level + offset;
      const pair = [nodes[index * 2], nodes[index * 2 + 1]].sort();
      nodes[index] = await hash(pair[0] + pair[1].slice(2));
    }));
  }
  return {
    root: nodes[1],
    proofs: payments.map((_, index) => {
      const proof = [];
      for (let cursor = size + index; cursor > 1; cursor >>= 1) proof.push(nodes[cursor ^ 1]);
      return proof;
    }),
  };
}

function sum(rows) {
  return {
    gas: rows.reduce((total, row) => total + row.gasUsed, 0),
    feeWei: rows.reduce((total, row) => total + BigInt(row.feeWei), 0n).toString(),
    calldataBytes: rows.reduce((total, row) => total + row.calldataBytes, 0),
    txCount: rows.length,
  };
}

async function run(workload, asset, path, sender, relayer) {
  const { recipients, payments, payouts, tree, prefund } = workload;
  const { addresses, receipts } = await deploy(asset, path);
  const token = addresses.BenchToken;
  const total = payments.reduce((amount, payment) => amount + payment.amount, 0n);
  const balance = async to => BigInt(asset === 'native'
    ? await rpc('eth_getBalance', to, 'latest')
    : await rpc('eth_call', { to: token, data: callData('balance', to) }, 'latest'));

  if (prefund) {
    for (const to of recipients) {
      receipts.push(asset === 'native'
        ? await send(sender, to, { value: 1n, stage: 'prefund' })
        : await send(sender, token, { data: callData('transfer', to, 1), stage: 'prefund' }));
    }
  }
  const initial = await Promise.all(recipients.map(balance));
  assert(initial.every(value => value === BigInt(prefund)), 'Unexpected starting recipient balance');
  const firstBlock = Number(BigInt(await rpc('eth_blockNumber')));

  if (path === 'P0') {
    for (const { to, amount } of payments) {
      receipts.push(asset === 'native'
        ? await send(sender, to, { value: amount })
        : await send(sender, token, { data: callData('transfer', to, amount) }));
    }
  } else if (path === 'P2') {
    const settlement = addresses.ClaimSettlement;
    receipts.push(await send(sender, settlement, { value: total, data: callData('publish', tree.root) }));
    for (const [index, { to, amount }] of payments.entries()) {
      const proof = tree.proofs[index];
      receipts.push(await send(relayer, settlement, {
        data: callData('claim', 1, index, to, amount, 160, proof.length, ...proof),
      }));
    }
  } else {
    const batch = addresses.BatchPayout;
    if (asset === 'token') {
      receipts.push(await send(sender, token, { data: callData('approve', batch, total), stage: 'approval' }));
    }
    receipts.push(await send(sender, batch, {
      value: asset === 'native' ? total : 0n,
      data: payoutData(asset, token, path === 'P1-net' ? payouts : payments),
    }));
  }

  const final = await Promise.all(recipients.map(balance));
  const expected = payouts.map(({ amount }) => amount + BigInt(prefund));
  assert.deepEqual(final, expected, `${workload.id}/${asset}/${path}: recipient balances`);
  const deployment = sum(receipts.filter(row => row.stage === 'deployment'));
  const totals = sum(receipts.filter(row => !['deployment', 'prefund'].includes(row.stage)));
  return {
    path, ...totals, deployment, finalBalances: final.map(String),
    feePerPaymentWei: (BigInt(totals.feeWei) / BigInt(payments.length)).toString(),
    deploymentGasPerPayment: deployment.gas / payments.length,
    deploymentFeePerPaymentWei: (BigInt(deployment.feeWei) / BigInt(payments.length)).toString(),
    blocksToSpendable: receipts.at(-1).block - firstBlock,
    receipts,
  };
}

function markdown(groups) {
  const lines = [
    '# Receipt-based payout benchmarks', '',
    'Totals include approval where required. Deployment is separate. Prefunding is excluded.',
    'Fee per payment is rounded down to whole wei. Block counts use Anvil automining and start after setup.',
    'Excluded costs include signatures, sponsorship / ERC-4337, cross-chain settlement, blob fees, and off-chain operations.',
  ];
  for (const { workload, asset, paths } of groups) {
    lines.push('', `## ${workload} · ${asset}`, '',
      '| Path | Total gas | Total fee (wei) | Fee per payment (wei) | Fee vs P0 | Tx count | Calldata bytes | Blocks to spendable |',
      '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |');
    for (const result of paths) {
      const { path, gas, feeWei, feePerPaymentWei, feeVsP0Percent, txCount, calldataBytes, blocksToSpendable } = result;
      lines.push(`| ${path} | ${gas} | ${feeWei} | ${feePerPaymentWei} | ${feeVsP0Percent}% | ${txCount} | ${calldataBytes} | ${blocksToSpendable} |`);
    }
    lines.push('', '| Path | Deployment gas | Deployment fee (wei) | Gas per payment | Fee per payment (wei) |',
      '| --- | ---: | ---: | ---: | ---: |');
    for (const { path, deployment, deploymentGasPerPayment, deploymentFeePerPaymentWei } of paths) {
      lines.push(`| ${path} | ${deployment.gas} | ${deployment.feeWei} | ${deploymentGasPerPayment} | ${deploymentFeePerPaymentWei} |`);
    }
  }
  return lines.join('\n') + '\n';
}

async function main() {
  assert.equal(process.argv.length, 2, 'Run without flags. Start local Anvil separately.');
  assert.equal(await rpc('eth_chainId'), '0x7a69', 'Expected local chain 31337');
  const [sender, relayer] = await rpc('eth_accounts');
  assert.equal(sender?.toLowerCase(), '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266', 'Unexpected benchmark mnemonic');
  const groups = [];
  for (const [id, count, prefund] of [['W1', 100, 0], ['W2', 100, 1], ['W3', 25, 0], ['W4', 10, 0]]) {
    const recipients = Array.from({ length: count }, (_, i) => '0x' + (0x10000 + i).toString(16).padStart(40, '0'));
    const payouts = recipients.map(to => ({ to, amount: 0n }));
    const payments = Array.from({ length: 100 }, (_, index) => {
      const payout = payouts[index % count];
      const amount = BigInt(index + 1);
      payout.amount += amount;
      return { to: payout.to, amount };
    });
    const workload = { id, prefund, recipients, payments, payouts, tree: await merkle(payments) };
    for (const asset of ['native', 'token']) {
      const paths = [];
      for (const path of asset === 'native' ? ['P0', 'P1', 'P1-net', 'P2'] : ['P0', 'P1', 'P1-net']) {
        const snapshot = await rpc('evm_snapshot');
        try {
          const result = await run(workload, asset, path, sender, relayer);
          if (paths.length) assert.deepEqual(result.finalBalances, paths[0].finalBalances);
          const baseline = BigInt(paths[0]?.feeWei ?? result.feeWei);
          result.feeVsP0Percent = (Number((BigInt(result.feeWei) * 10000n + baseline / 2n) / baseline) / 100).toFixed(2);
          paths.push(result);
        } finally {
          assert(await rpc('evm_revert', snapshot), 'Could not restore Anvil state');
        }
      }
      groups.push({ workload: id, asset, paths });
      console.log(`${id} ${asset}: ${paths.map(({ path, gas }) => `${path}=${gas}`).join(', ')}`);
    }
  }

  mkdirSync('bench', { recursive: true });
  writeFileSync('bench/results.json', JSON.stringify(groups, null, 2) + '\n');
  writeFileSync('bench/results.md', markdown(groups));
}

await main();
