import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { setTimeout } from 'node:timers/promises';
import {
  encodeFunctionData, hashTypedData, keccak256, parseEventLogs, toHex,
} from '../../node/node_modules/viem/_esm/index.js';
import { mnemonicToAccount } from '../../node/node_modules/viem/_esm/accounts/index.js';

const portReservation = createServer();
portReservation.listen(0, '127.0.0.1');
await once(portReservation, 'listening');
const { port } = portReservation.address();
await new Promise((resolve, reject) => portReservation.close(error => error ? reject(error) : resolve()));
const chainId = 31337;
const gasPrice = 2_000_000_000n;
const deposit = 10n ** 15n;
const mnemonic = 'test test test test test test test test test test test junk';
const artifact = JSON.parse(readFileSync('out/NativePaymentPilot.sol/NativePaymentPilot.json', 'utf8'));
const types = {
  HubTransfer: [
    { name: 'from', type: 'address' }, { name: 'to', type: 'address' },
    { name: 'assetId', type: 'bytes32' }, { name: 'amount', type: 'uint256' },
    { name: 'fee', type: 'uint256' }, { name: 'feeAssetId', type: 'bytes32' },
    { name: 'nonce', type: 'uint256' }, { name: 'deadline', type: 'uint64' },
    { name: 'serviceId', type: 'bytes32' }, { name: 'manifestHash', type: 'bytes32' },
  ],
};
let requestId = 0;
async function rpc(method, ...params) {
  const response = await fetch(`http://127.0.0.1:${port}`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: ++requestId, method, params }),
    signal: AbortSignal.timeout(10_000),
  });
  const { result, error } = await response.json();
  if (!response.ok || error) throw new Error(`${method}: ${error?.message ?? response.status}`);
  return result;
}
const addressKey = address => address.toLowerCase();
const balance = async address => BigInt(await rpc('eth_getBalance', address, 'latest'));
const callData = (functionName, args) => encodeFunctionData({ abi: artifact.abi, functionName, args });
async function send(stage, from, to, value = 0n, data = '0x') {
  const tx = { from, ...(to ? { to } : {}), value: toHex(value), data, gas: toHex(29_000_000), gasPrice: toHex(gasPrice) };
  const hash = await rpc('eth_sendTransaction', tx);
  let receipt;
  for (let attempt = 0; attempt < 100; attempt++) {
    receipt = await rpc('eth_getTransactionReceipt', hash);
    if (receipt) break;
    await setTimeout(10);
  }
  assert.equal(receipt?.status, '0x1', `${stage} failed: ${hash}`);
  return { stage, tx, receipt };
}
const fee = ({ receipt }) => BigInt(receipt.gasUsed) * BigInt(receipt.effectiveGasPrice)
  + BigInt(receipt.l1Fee ?? 0) + BigInt(receipt.blobGasUsed ?? 0) * BigInt(receipt.blobGasPrice ?? 0);
function summarize(rows) {
  return {
    transactions: rows.length,
    gas: rows.reduce((total, { receipt }) => total + Number(BigInt(receipt.gasUsed)), 0),
    feeWei: rows.reduce((total, row) => total + fee(row), 0n).toString(),
    dataBytes: rows.reduce((total, { tx }) => total + (tx.data.length - 2) / 2, 0),
  };
}
async function isolated(run) {
  const snapshot = await rpc('evm_snapshot');
  try { return await run(); } finally { assert(await rpc('evm_revert', snapshot)); }
}
function buildWorkload(accounts, reuse) {
  const payments = [];
  const totals = new Map();
  for (let round = 0; round < reuse; round++) {
    for (const [index, account] of accounts.entries()) {
      const to = accounts[(index + 1 + round % 3) % accounts.length].address;
      const amount = 10n ** 12n + BigInt(index);
      const payment = { from: account.address, to, amount };
      payments.push(payment);
      const pair = `${addressKey(account.address)}:${addressKey(to)}`;
      const previous = totals.get(pair);
      totals.set(pair, { ...payment, amount: amount + (previous?.amount ?? 0n) });
    }
  }
  return { payments, net: [...totals.values()] };
}
async function bench(accounts, operator, reuse) {
  const { payments, net } = buildWorkload(accounts, reuse);
  const initial = new Map(await Promise.all(accounts.map(async ({ address }) => [addressKey(address), await balance(address)])));
  const expected = new Map(initial);
  for (const { from, to, amount } of payments) {
    expected.set(addressKey(from), expected.get(addressKey(from)) - amount);
    expected.set(addressKey(to), expected.get(addressKey(to)) + amount);
  }
  async function verify(rows) {
    const fees = new Map();
    for (const row of rows) {
      const key = addressKey(row.tx.from);
      fees.set(key, (fees.get(key) ?? 0n) + fee(row));
    }
    return Promise.all(accounts.map(async ({ address }) => {
      const key = addressKey(address);
      const actual = await balance(address);
      assert.equal(actual + (fees.get(key) ?? 0n), expected.get(key), `Wallet principal mismatch for ${address}`);
      return actual.toString();
    }));
  }
  async function direct(list) {
    return isolated(async () => {
      const rows = [];
      for (const { from, to, amount } of list) rows.push(await send('direct', from, to, amount));
      return { summary: summarize(rows), walletBalances: await verify(rows), rows };
    });
  }
  const p0 = await direct(payments);
  const p0Net = await direct(net);
  const pilot = await isolated(async () => {
    const deployment = await send('deployment', operator, undefined, 0n, artifact.bytecode.object);
    const contract = deployment.receipt.contractAddress;
    const rows = [deployment];
    for (const { address } of accounts) rows.push(await send('deposit', address, contract, deposit, callData('deposit')));
    const assetId = await rpc('eth_call', { to: contract, data: callData('nativeAssetId') }, 'latest');
    const domain = { name: 'ZeroGasHub', version: '1', chainId, verifyingContract: contract };
    const accountByAddress = new Map(accounts.map(account => [account.address, account]));
    const zero = toHex(0n, { size: 32 });
    const deadline = (1n << 64n) - 1n;
    const nonces = new Map();
    const intents = payments.map(payment => {
      const nonce = nonces.get(payment.from) ?? 0n;
      nonces.set(payment.from, nonce + 1n);
      return { ...payment, assetId, fee: 0n, feeAssetId: assetId, nonce, deadline,
        serviceId: keccak256(payment.to), manifestHash: zero };
    });
    for (let offset = 0; offset < intents.length; offset += 100) {
      const batch = intents.slice(offset, offset + 100);
      const signatures = await Promise.all(batch.map(message =>
        accountByAddress.get(message.from).signTypedData({ domain, types, primaryType: 'HubTransfer', message })));
      const row = await send('settlement', operator, contract, 0n, callData('settle', [batch, signatures]));
      rows.push(row);
      const paid = parseEventLogs({ abi: artifact.abi, eventName: 'Paid', logs: row.receipt.logs });
      assert.deepEqual(paid.map(log => log.args.digest), batch.map(message =>
        hashTypedData({ domain, types, primaryType: 'HubTransfer', message })));
    }
    for (const { address } of accounts) {
      const amount = BigInt(await rpc('eth_call', { to: contract, data: callData('balanceOf', [address]) }, 'latest'));
      const key = addressKey(address);
      assert.equal(amount, deposit + expected.get(key) - initial.get(key));
      if (amount > 0n) rows.push(await send('withdrawal', address, contract, 0n, callData('withdraw', [amount])));
    }
    assert.equal(await balance(contract), 0n);
    return {
      summary: summarize(rows), walletBalances: await verify(rows), rows,
      stages: Object.fromEntries(['deployment', 'deposit', 'settlement', 'withdrawal'].map(stage =>
        [stage, summarize(rows.filter(row => row.stage === stage))])),
    };
  });
  return { reuse, payments: payments.length, p0, p0Net, pilot };
}
const anvil = spawn('anvil', ['--silent', '--host', '127.0.0.1', '--port', String(port),
  '--chain-id', String(chainId), '--hardfork', 'prague', '--accounts', '21', '--mnemonic', mnemonic,
  '--prune-history'], { stdio: ['ignore', 'inherit', 'inherit'] });
let anvilError;
anvil.on('error', error => { anvilError = error; });
try {
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    if (anvilError) throw anvilError;
    if (anvil.exitCode !== null) throw new Error('Anvil exited before the benchmark');
    try { ready = await rpc('web3_clientVersion'); } catch { await setTimeout(50); }
    if (ready) break;
  }
  assert.match(ready, /anvil/i);
  assert.equal(BigInt(await rpc('eth_chainId')), BigInt(chainId));
  const [operator, ...unlocked] = await rpc('eth_accounts');
  assert.equal(unlocked.length, 20);
  const accounts = unlocked.map((address, index) => {
    const account = mnemonicToAccount(mnemonic, { addressIndex: index + 1 });
    assert.equal(addressKey(account.address), addressKey(address));
    return account;
  });
  const results = [];
  for (const reuse of [1, 10, 100]) {
    results.push(await bench(accounts, operator, reuse));
    console.log(`Measured ${reuse} payments per account`);
  }
  const savings = (cost, baseline) => (100 * (1 - cost / baseline)).toFixed(2) + '%';
  const lines = [
    '# Single-chain native payment pilot',
    '', `Local Prague receipts from ${ready}. 20 funded participants, up to three independent counterparties per payer.`,
    'Both baselines use direct EOA transfers from the same starting state. P0-net sends one transfer per payer/payee pair.',
    'All paths finish with equivalent fee-adjusted wallet balances. The pilot checks each signed payment event and withdraws every remaining balance.',
    'Pilot totals include deployment, deposits, signed batches and withdrawals. Calldata is included in execution gas.',
    'The pilot verifies every signature on chain. SP1 proving, blob publication and cross-chain relays are unmeasured.',
    'The 90–99% target for a validity-proven hub remains unmeasured.',
    '',
    '| Payments/account | Payments | P0 gas | P0-net gas | Pilot gas | Savings vs P0 | Savings vs P0-net |',
    '| ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
    ...results.map(({ reuse, payments, p0, p0Net, pilot }) =>
      `| ${reuse} | ${payments} | ${p0.summary.gas} | ${p0Net.summary.gas} | ${pilot.summary.gas} | ${savings(pilot.summary.gas, p0.summary.gas)} | ${savings(pilot.summary.gas, p0Net.summary.gas)} |`),
    '', '| Payments/account | Deployment gas | Deposit gas | Settlement gas | Withdrawal gas | Pilot fee (wei) |',
    '| ---: | ---: | ---: | ---: | ---: | ---: |',
    ...results.map(({ reuse, pilot: { stages, summary } }) =>
      `| ${reuse} | ${stages.deployment.gas} | ${stages.deposit.gas} | ${stages.settlement.gas} | ${stages.withdrawal.gas} | ${summary.feeWei} |`),
    '', '| Payments/account | Deposit + withdrawal gas | 90% P0-net gas budget | 99% P0-net gas budget |',
    '| ---: | ---: | ---: | ---: |',
    ...results.map(({ reuse, p0Net, pilot: { stages } }) =>
      `| ${reuse} | ${stages.deposit.gas + stages.withdrawal.gas} | ${Math.floor(p0Net.summary.gas / 10)} | ${Math.floor(p0Net.summary.gas / 100)} |`),
    '', 'The last table compares measured entry and exit costs with the full budget for each target. It assumes this pilot’s entry and exit design.',
    '', 'Negative savings mean the pilot costs more. P0 includes the effect of choosing a settlement window.', '',
  ];
  mkdirSync('bench', { recursive: true });
  writeFileSync('bench/native-pilot-results.json', JSON.stringify({
    client: ready, chainId, artifactHash: keccak256(artifact.bytecode.object), results,
  }, null, 2));
  writeFileSync('bench/native-pilot-results.md', lines.join('\n'));
  console.log(lines.join('\n'));
} finally {
  if (anvil.pid && anvil.exitCode === null) {
    const exited = once(anvil, 'exit');
    anvil.kill();
    await exited;
  }
}
