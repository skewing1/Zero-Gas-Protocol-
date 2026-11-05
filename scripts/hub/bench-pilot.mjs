import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { createServer } from 'node:net';
import { setTimeout } from 'node:timers/promises';
import {
  encodeAbiParameters, encodeFunctionData, hashTypedData, keccak256, parseEventLogs, toHex,
} from '../../node/node_modules/viem/_esm/index.js';
import { mnemonicToAccount } from '../../node/node_modules/viem/_esm/accounts/index.js';

import { createMerchant } from '../../network/checkout/merchant.mjs';
import { approvePayment } from '../../network/checkout/payment.mjs';

const portReservation = createServer();
portReservation.listen(0, '127.0.0.1');
await once(portReservation, 'listening');
const { port } = portReservation.address();
await new Promise((resolve, reject) => portReservation.close(error => error ? reject(error) : resolve()));
const chainId = 31337;
const gasPrice = 2_000_000_000n;
const deposit = 10n ** 15n;
const mnemonic = 'test test test test test test test test test test test junk';
const transactors = process.argv.includes('--transactors');
const clearing = transactors || process.argv.includes('--clearing');
const merchantScreen = process.argv.includes('--merchant-screen');
const checkout = merchantScreen || process.argv.includes('--checkout');
assert(!(clearing && checkout), 'Choose one benchmark mode');
const contractName = clearing || merchantScreen ? 'NativeClearingPilot' : 'NativePaymentPilot';
const output = transactors ? 'bench/network-transactors-results' : clearing ? 'bench/native-clearing-results' : 'bench/native-pilot-results';
const artifact = checkout && !merchantScreen ? null : JSON.parse(readFileSync(`out/${contractName}.sol/${contractName}.json`, 'utf8'));
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
function buildWorkload(accounts, reuse, counterparties) {
  const payments = [];
  const totals = new Map();
  for (let round = 0; round < reuse; round++) {
    for (const [index, account] of accounts.entries()) {
      const to = accounts[(index + 1 + round % counterparties) % accounts.length].address;
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
async function bench(accounts, operator, reuse, counterparties, workload) {
  const { payments, net } = workload ?? buildWorkload(accounts, reuse, counterparties);
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
  async function direct(list, quoted = false) {
    return isolated(async () => {
      const rows = [];
      const transfers = quoted ? createMerchant(rpc, { chainId }) : undefined;
      for (const { from, to, amount } of list) {
        if (!quoted) { rows.push(await send('direct', from, to, amount)); continue; }
        const quote = await transfers.quote(from, { payee: to, amountWei: amount });
        const txHash = await approvePayment({ async request({ method, params }) {
          if (method === 'eth_chainId') return rpc(method);
          if (method === 'eth_accounts') return [from];
          if (method === 'eth_getTransactionCount') return rpc(method, ...params);
          assert.equal(method, 'eth_sendTransaction');
          const [tx] = params;
          const row = await send('reviewed-transfer', tx.from, tx.to, BigInt(tx.value), tx.data);
          rows.push(row);
          return row.receipt.transactionHash;
        } }, quote);
        const verified = await transfers.verify(quote.id, txHash);
        assert.equal(verified.state, 'paid');
        assert.equal(BigInt(verified.networkFee), fee(rows.at(-1)));
        await assert.rejects(transfers.verify((await transfers.quote(from, { payee: to, amountWei: amount })).id, txHash), /does not pay/);
      }
      return { summary: summarize(rows), walletBalances: await verify(rows), rows };
    });
  }
  const p0 = await direct(payments);
  const reviewedTransfer = transactors ? await direct(payments, true) : undefined;
  if (reviewedTransfer) assert.equal(reviewedTransfer.summary.gas, p0.summary.gas, 'Reviewed transfer must not add gas over P0');
  // When every pair is unique, P0 and P0-net specify identical transactions in
  // identical order. One receipt set measures both paths.
  const p0Net = net.length === payments.length ? p0 : await direct(net);
  const pilot = await isolated(async () => {
    const deployment = await send('deployment', operator, undefined, 0n, artifact.bytecode.object);
    const contract = deployment.receipt.contractAddress;
    const rows = [deployment];
    const funding = new Map(accounts.map(({ address }) => {
      const key = addressKey(address);
      const deficit = initial.get(key) - expected.get(key);
      return [key, transactors ? (deficit > 0n ? deficit : 0n) : deposit];
    }));
    for (const { address } of accounts) {
      const amount = funding.get(addressKey(address));
      if (amount > 0n) rows.push(await send('deposit', address, contract, amount, callData('deposit')));
    }
    if (clearing) {
      rows.push(await clearWindow(accounts, operator, contract, payments, initial, expected));
    } else {
      rows.push(...await settlePayments(accounts, operator, contract, payments));
    }
    for (const { address } of accounts) {
      const amount = BigInt(await rpc('eth_call', { to: contract, data: callData('balanceOf', [address]) }, 'latest'));
      const key = addressKey(address);
      assert.equal(amount, funding.get(key) + expected.get(key) - initial.get(key));
      if (amount > 0n) rows.push(await send('withdrawal', address, contract, 0n, callData('withdraw', [amount])));
    }
    assert.equal(await balance(contract), 0n);
    return {
      summary: summarize(rows), walletBalances: await verify(rows), rows,
      stages: Object.fromEntries(['deployment', 'deposit', 'settlement', 'withdrawal'].map(stage =>
        [stage, summarize(rows.filter(row => row.stage === stage))])),
    };
  });
  return { scenario: workload?.name, reuse, participants: accounts.length, counterparties, payments: payments.length, p0, p0Net, reviewedTransfer, pilot };
}

async function settlePayments(accounts, operator, contract, payments) {
  const rows = [];
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
  return rows;
}

async function clearWindow(accounts, operator, contract, payments, initial, expected) {
  const ordered = [...accounts].sort((a, b) => addressKey(a.address).localeCompare(addressKey(b.address)));
  const entries = ordered.map(({ address }) => {
    const key = addressKey(address);
    return { owner: address, nonce: 0n, delta: expected.get(key) - initial.get(key) };
  });
  const entrySchema = { type: 'tuple[]', components: [
    { name: 'owner', type: 'address' }, { name: 'nonce', type: 'uint256' }, { name: 'delta', type: 'int256' },
  ] };
  const paymentSchema = { type: 'tuple[]', components: [
    { name: 'from', type: 'address' }, { name: 'to', type: 'address' }, { name: 'amount', type: 'uint256' },
  ] };
  const paymentsHash = keccak256(encodeAbiParameters([paymentSchema], [payments]));
  const deadline = (1n << 64n) - 1n;
  const typed = {
    domain: { name: 'ZeroGasHub', version: '1', chainId, verifyingContract: contract },
    types: { ClearWindow: [
      { name: 'entriesHash', type: 'bytes32' }, { name: 'paymentsHash', type: 'bytes32' },
      { name: 'deadline', type: 'uint64' },
    ] },
    primaryType: 'ClearWindow',
    message: { entriesHash: keccak256(encodeAbiParameters([entrySchema], [entries])), paymentsHash, deadline },
  };
  const signatures = await Promise.all(ordered.map(account => account.signTypedData(typed)));
  const row = await send('settlement', operator, contract, 0n, callData('clear', [entries, paymentsHash, deadline, signatures]));
  const [event, extra] = parseEventLogs({ abi: artifact.abi, eventName: 'WindowCleared', logs: row.receipt.logs });
  assert.equal(extra, undefined);
  assert.equal(event.args.digest, hashTypedData(typed));
  assert.equal(event.args.paymentsHash, paymentsHash);
  assert.equal(event.args.participants, BigInt(entries.length));
  row.paymentList = payments.map(payment => ({ ...payment, amount: payment.amount.toString() }));
  return row;
}
async function benchCheckout(shoppers, payees, visits, operator) {
  await rpc('anvil_reset');
  const accounts = [...shoppers, ...payees];
  const amount = 10n ** 15n;
  const payments = [];
  const totals = new Map();
  for (let visit = 0; visit < visits; visit++) {
    for (const { address: from } of shoppers) {
      const to = payees[visit % payees.length].address;
      payments.push({ from, to, amount });
      const key = `${from}:${to}`;
      totals.set(key, { from, to, amount: amount + (totals.get(key)?.amount ?? 0n) });
    }
  }
  const initial = new Map(await Promise.all(accounts.map(async ({ address }) => [addressKey(address), await balance(address)])));
  const expected = new Map(initial);
  for (const { from, to, amount: value } of payments) {
    expected.set(addressKey(from), expected.get(addressKey(from)) - value);
    expected.set(addressKey(to), expected.get(addressKey(to)) + value);
  }
  const merchants = new Map(payees.map(({ address: payee }) => [
    payee, createMerchant(rpc, { payee, amountWei: amount, chainId }),
  ]));
  async function run(list, useCheckout) {
    await rpc('anvil_reset');
    const rows = [];
    const quotes = [];
    for (const { from, to, amount: value } of list) {
      if (!useCheckout) {
        rows.push(await send('direct', from, to, value));
        continue;
      }
      const merchant = merchants.get(to);
      const quote = await merchant.quote(from);
      const wallet = {
        async request({ method, params }) {
          if (method === 'eth_chainId') return rpc(method);
          if (method === 'eth_accounts') return [from];
          if (method === 'eth_getTransactionCount') return rpc(method, ...params);
          assert.equal(method, 'eth_sendTransaction');
          const [tx] = params;
          const row = await send('checkout', tx.from, tx.to, BigInt(tx.value), tx.data);
          rows.push(row);
          return row.receipt.transactionHash;
        },
      };
      const txHash = await approvePayment(wallet, quote);
      assert.equal((await merchant.verify(quote.id, txHash)).state, 'paid');
      if (quotes.length === 0) {
        const other = await merchant.quote(from);
        await assert.rejects(merchant.verify(other.id, txHash), /does not pay this quote/);
      }
      quotes.push(quote);
    }
    return { summary: summarize(rows), rows, quotes, walletBalances: await verify(rows) };
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
      assert.equal(actual + (fees.get(key) ?? 0n), expected.get(key));
      return actual.toString();
    }));
  }
  const p0 = await run(payments, false);
  const p0Net = totals.size === payments.length ? p0 : await run([...totals.values()], false);
  if (merchantScreen) {
    await rpc('anvil_reset');
    const deployment = await send('deployment', operator, undefined, 0n, artifact.bytecode.object);
    const contract = deployment.receipt.contractAddress;
    const rows = [deployment];
    for (const { address } of shoppers) {
      rows.push(await send('deposit', address, contract, amount * BigInt(visits), callData('deposit')));
    }
    rows.push(await clearWindow(accounts, operator, contract, payments, initial, expected));
    for (const { address } of payees) {
      const proceeds = expected.get(addressKey(address)) - initial.get(addressKey(address));
      rows.push(await send('withdrawal', address, contract, 0n, callData('withdraw', [proceeds])));
    }
    assert.equal(await balance(contract), 0n);
    const endpointRows = rows.filter(row => row.stage === 'deposit' || row.stage === 'withdrawal');
    return {
      shoppers: shoppers.length, merchants: payees.length, visits, payments: payments.length,
      p0, p0Net, pilot: { summary: summarize(rows), rows, walletBalances: await verify(rows) },
      endpoints: summarize(endpointRows),
    };
  }
  const directCheckout = await run(payments, true);
  return { shoppers: shoppers.length, merchants: payees.length, visits, payments: payments.length, p0, p0Net, directCheckout };
}

async function runCheckout(accounts, client, operator) {
  const shoppers = accounts.slice(0, 20);
  const payees = accounts.slice(20);
  const results = [];
  for (const [visits, merchants] of [[1, 1], [10, 1], [10, 3]]) {
    results.push(await benchCheckout(shoppers, payees.slice(0, merchants), visits, operator));
  }
  if (merchantScreen) {
    const report = [
      '# Can the funded hub reach 90% on merchant payments?', '',
      `Local Prague receipts from ${client}.`,
      'Each shopper deposits exactly enough for the full window. Merchants withdraw once each. All routes reach equivalent final wallet balances after fees. The clearing contract uses real signatures.',
      'The entry and exit column removes all settlement and deployment gas from the measured pilot. It gives an optimistic cost for this funding and cash-out design. Data publication and operating costs are also omitted from that column.',
      '',
      '| Shoppers | Merchants | Purchases per shopper | P0 gas | P0-net gas | Full pilot gas | Entry and exit alone | Full gas budget at 90% vs P0-net |',
      '| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
      ...results.map(({ shoppers, merchants, visits, p0, p0Net, pilot, endpoints }) =>
        `| ${shoppers} | ${merchants} | ${visits} | ${p0.summary.gas} | ${p0Net.summary.gas} | ${pilot.summary.gas} | ${endpoints.gas} | ${Math.floor(p0Net.summary.gas / 10)} |`),
      '',
      ...results.map(({ merchants, visits, endpoints, p0Net }) =>
        `- ${visits} purchases per shopper across ${merchants} merchant(s): entry and exit alone use ${(10 * endpoints.gas / p0Net.summary.gas).toFixed(1)}× the 90% gas budget.`),
      '',
      'This screen applies to individually funded native ETH balances on one chain, with wallet payouts at the end of the window. It does not estimate savings on another chain or with an alternative funding model.', '',
    ].join('\n');
    mkdirSync('bench', { recursive: true });
    writeFileSync('bench/merchant-screen-results.json', JSON.stringify({ client, chainId, results }, null, 2));
    writeFileSync('bench/merchant-screen-results.md', report);
    console.log(report);
    return;
  }
  const gasIncrease = (cost, baseline) => (100 * (cost / baseline - 1)).toFixed(2) + '%';
  const lines = [
    '# Direct ETH checkout benchmark', '',
    `Local Prague receipts from ${client}. These are synthetic shopper-to-merchant workloads with no customer-to-customer payments.`,
    'A checkout quote specifies the price, estimated network fee, chain and destination wallet. The wallet sends one plain transfer with empty calldata and the reviewed nonce. The merchant verifies the mined transaction against that quote.',
    'P0 uses one plain ETH transfer per purchase. P0-net uses one plain ETH transfer per shopper/merchant pair over the entire window. All three finish with equivalent fee-adjusted wallet balances.',
    'P0-net combines purchases into one later settlement. The checkout path confirms purchases individually as transactions are mined.',
    '',
    '| Shoppers | Merchants | Purchases per shopper | P0 gas | P0-net gas | Checkout gas | Checkout fee (wei) | Extra gas vs P0 | Extra gas vs P0-net |',
    '| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
    ...results.map(({ shoppers, merchants, visits, p0, p0Net, directCheckout }) =>
      `| ${shoppers} | ${merchants} | ${visits} | ${p0.summary.gas} | ${p0Net.summary.gas} | ${directCheckout.summary.gas} | ${directCheckout.summary.feeWei} | ${gasIncrease(directCheckout.summary.gas, p0.summary.gas)} | ${gasIncrease(directCheckout.summary.gas, p0Net.summary.gas)} |`),
    '',
    'No contract deployment, deposits or withdrawals are required. Results cover local transaction costs. Wallet interaction time, merchant hosting costs, and public-network fees are unmeasured.', '',
  ];
  mkdirSync('bench', { recursive: true });
  const checkoutRaw = JSON.stringify({ client, chainId, results }, null, 2);
  writeFileSync('bench/direct-checkout-results.json', checkoutRaw);
  writeFileSync('bench/direct-checkout-results.json.gz', gzipSync(checkoutRaw));
  writeFileSync('bench/direct-checkout-results.md', lines.join('\n'));
  console.log(lines.join('\n'));
}

async function runTransactors(accounts, operator, client) {
  const peers = accounts.slice(0, 20);
  const workloads = [
    { name: 'unique-payers-unique-payees', participants: accounts, payments: peers.map((payer, index) => ({ from: payer.address, to: accounts[index + 20].address, amount: 10n ** 12n + BigInt(index) })) },
    { name: 'peer-ring-repeated', participants: peers, payments: buildWorkload(peers, 10, 1).payments },
    { name: 'mixed-peer-network', participants: peers, payments: buildWorkload(peers, 10, 7).payments },
    { name: 'all-peers-once-per-pair', participants: peers, payments: buildWorkload(peers, 19, 19).payments },
  ];
  const results = [];
  for (const workload of workloads) {
    const totals = new Map();
    for (const payment of workload.payments) {
      const pair = `${addressKey(payment.from)}:${addressKey(payment.to)}`;
      totals.set(pair, { ...payment, amount: payment.amount + (totals.get(pair)?.amount ?? 0n) });
    }
    const result = await bench(workload.participants, operator, 0, 0, { ...workload, net: [...totals.values()] });
    results.push(result);
    console.log(`Measured ${workload.name}`);
  }
  const saving = (cost, baseline) => (100 * (1 - cost / baseline)).toFixed(2) + '%';
  const report = [
    '# Network transactor lifecycle benchmark', '',
    `Measured local Prague receipts: ${client}. Native ETH only. Every participant starts with spendable ETH, including gas. No fresh or zero-gas recipient claim is tested.`,
    'P0 sends each payment directly. P0-net sends each payer/payee window total directly. The pilot deposits, jointly signs one clearing window, and withdraws all funds to wallets. Every route starts at the same snapshot and asserts fee-adjusted final wallet balances.',
    'Pilot totals include deployment, every deposit, signed clearing, and every withdrawal. Only net debtors fund their exact window deficit; net creditors withdraw their proceeds. Every participant still signs. This is optimized window clearing, with funds usable only when the whole window clears.',
    'This pilot requires unanimous participant signatures and off-chain payment-list verification and retention. It is not a validity-proven hub. Proof production, durable data publication and operating costs remain unmeasured. Gates below apply only to the measured local pilot.', '',
    '| Workload | Payments | P0 gas | P0-net gas | Full pilot gas | Saving vs P0 (includes aggregation) | Saving vs P0-net | 90% vs P0-net | 99% vs P0-net |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- |',
    ...results.map(r => `| ${r.scenario} | ${r.payments} | ${r.p0.summary.gas} | ${r.p0Net.summary.gas} | ${r.pilot.summary.gas} | ${saving(r.pilot.summary.gas, r.p0.summary.gas)} | ${saving(r.pilot.summary.gas, r.p0Net.summary.gas)} | ${r.pilot.summary.gas * 10 <= r.p0Net.summary.gas ? 'PASS' : 'FAIL'} | ${r.pilot.summary.gas * 100 <= r.p0Net.summary.gas ? 'PASS' : 'FAIL'} |`), '',
    '| Workload | Reviewed-transfer gas | Extra gas vs plain P0 | Receipt fee reconciliation |',
    '| --- | ---: | ---: | --- |',
    ...results.map(r => `| ${r.scenario} | ${r.reviewedTransfer.summary.gas} | ${r.reviewedTransfer.summary.gas - r.p0.summary.gas} | PASS |`), '',
    'The reviewed-transfer route uses user-selected recipients and amounts. Quote IDs remain off-chain. Verification checks the payer, payee, amount, transaction nonce, empty calldata and canonical mined block. This route matches plain-transfer execution cost and claims no saving over plain transfers on the same chain.', '',
    'Fresh recipients, ERC-20, public networks, validity proofs, and the complete proposed system remain unmeasured here. These rows cannot establish platform-wide 90–99% savings.', '',
  ].join('\n');
  mkdirSync('bench', { recursive: true });
  const raw = JSON.stringify({ client, chainId, artifactHash: keccak256(artifact.bytecode.object), results }, null, 2);
  writeFileSync(`${output}.json`, raw);
  writeFileSync(`${output}.json.gz`, gzipSync(raw));
  writeFileSync(`${output}.md`, report);
  console.log(report);
}

const anvil = spawn('anvil', ['--silent', '--host', '127.0.0.1', '--port', String(port),
  '--chain-id', String(chainId), '--hardfork', 'prague', '--accounts', transactors ? '41' : clearing ? '102' : checkout ? '24' : '21', '--mnemonic', mnemonic,
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
  assert.equal(unlocked.length, transactors ? 40 : clearing ? 101 : checkout ? 23 : 20);
  const accounts = unlocked.map((address, index) => {
    const account = mnemonicToAccount(mnemonic, { addressIndex: index + 1 });
    assert.equal(addressKey(account.address), addressKey(address));
    return account;
  });
  if (transactors) {
    await runTransactors(accounts, operator, ready);
  } else if (checkout) {
    await runCheckout(accounts, ready, operator);
  } else {
    const results = [];
    for (const reuse of [1, 10, 100]) {
      results.push(await bench(accounts.slice(0, 20), operator, reuse, 3));
      console.log(`Measured ${reuse} payments per account`);
    }
    if (clearing) {
      results.push(await bench(accounts, operator, 100, 100));
      console.log('Measured 100 unique counterparties per account');
    }
    const savings = (cost, baseline) => (100 * (1 - cost / baseline)).toFixed(2) + '%';
    const lines = [
      clearing ? '# Jointly authorized native clearing pilot' : '# Single-chain native payment pilot',
      '', `Local Prague receipts from ${ready}. Each workload starts from a fresh snapshot.`,
      'Both baselines use direct EOA transfers from the same starting state. P0-net sends one transfer per payer/payee pair.',
      'All paths finish with equivalent fee-adjusted wallet balances and withdraw every remaining balance.',
      clearing ? 'Each participant signs the same window with a commitment to its payment list. Clients must retain and validate that list off chain. The contract checks consent and net balance conservation.' : 'The pilot checks every signed payment event.',
      'When every pair is unique, P0 and P0-net use the same measured receipt set.',
      'Pilot totals include deployment, deposits, signed batches and withdrawals. Calldata is included in execution gas.',
      'The pilot verifies submitted signatures on chain. SP1 proving, durable off-chain list publication and cross-chain relays are unmeasured.',
      'The 90–99% target for a validity-proven hub remains unmeasured.',
      '',
      '| Participants | Counterparties/account | Payments/account | Payments | P0 gas | P0-net gas | Pilot gas | Savings vs P0 | Savings vs P0-net |',
      '| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
      ...results.map(({ participants, counterparties, reuse, payments, p0, p0Net, pilot }) =>
        `| ${participants} | ${Math.min(counterparties, reuse)} | ${reuse} | ${payments} | ${p0.summary.gas} | ${p0Net.summary.gas} | ${pilot.summary.gas} | ${savings(pilot.summary.gas, p0.summary.gas)} | ${savings(pilot.summary.gas, p0Net.summary.gas)} |`),
      '', '| Participants | Payments/account | Deployment gas | Deposit gas | Settlement gas | Withdrawal gas | Pilot fee (wei) |',
      '| ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
      ...results.map(({ participants, reuse, pilot: { stages, summary } }) =>
        `| ${participants} | ${reuse} | ${stages.deployment.gas} | ${stages.deposit.gas} | ${stages.settlement.gas} | ${stages.withdrawal.gas} | ${summary.feeWei} |`),
      '', '| Participants | Payments/account | Deposit + withdrawal gas | 90% P0-net gas budget | 99% P0-net gas budget |',
      '| ---: | ---: | ---: | ---: | ---: |',
      ...results.map(({ participants, reuse, p0Net, pilot: { stages } }) =>
        `| ${participants} | ${reuse} | ${stages.deposit.gas + stages.withdrawal.gas} | ${Math.floor(p0Net.summary.gas / 10)} | ${Math.floor(p0Net.summary.gas / 100)} |`),
      '', 'The last table compares measured entry and exit costs with the full budget for each target. It assumes this pilot’s entry and exit design.',
      '', 'Negative savings mean the pilot costs more. P0 includes the effect of choosing a settlement window.', '',
    ];
    mkdirSync('bench', { recursive: true });
    writeFileSync(`${output}.json`, JSON.stringify({
      client: ready, chainId, artifactHash: keccak256(artifact.bytecode.object), results,
    }, null, 2));
    writeFileSync(`${output}.md`, lines.join('\n'));
    console.log(lines.join('\n'));
  }
} finally {
  if (anvil.pid && anvil.exitCode === null) {
    const exited = once(anvil, 'exit');
    anvil.kill();
    await exited;
  }
}
