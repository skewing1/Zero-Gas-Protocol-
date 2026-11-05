import assert from 'node:assert/strict';
import test from 'node:test';
import { createMerchant } from './merchant.mjs';

const payer = '0x0000000000000000000000000000000000000001';
const first = '0x0000000000000000000000000000000000000002';
const second = '0x0000000000000000000000000000000000000003';
const fixture = () => {
  const estimates = [];
  const rpc = async (method, ...params) => {
    if (method === 'eth_getTransactionCount') return '0x0';
    if (method === 'eth_chainId') return '0x7a69';
    if (method === 'eth_getBlockByNumber') return { number: '0x1', timestamp: '0x1' };
    if (method === 'eth_getCode') return '0x';
    if (method === 'eth_gasPrice') return '0x2';
    if (method === 'eth_getBalance') return '0xffffffffffffffff';
    if (method === 'eth_estimateGas') { estimates.push(params[0]); return '0x5300'; }
    assert.fail(method);
  };
  return { estimates, transfers: createMerchant(rpc, { chainId: 31337 }) };
};

test('each transactor can choose a recipient and exact amount per quote', async () => {
  const { transfers, estimates } = fixture();
  const a = await transfers.quote(payer, { payee: first, amountWei: 1n });
  const b = await transfers.quote(payer, { payee: second, amountWei: 1234567890123456789n });
  assert.equal(a.payee, first);
  assert.equal(a.value, '0x1');
  assert.equal(b.payee, second);
  assert.equal(BigInt(b.value), 1234567890123456789n);
  assert.notEqual(a.id, b.id);
  assert.deepEqual(estimates.map(tx => tx.to), [first, second]);
});

test('invalid recipient, self-transfer, zero and overflowing amounts fail before simulation', async () => {
  const { transfers, estimates } = fixture();
  for (const payee of ['0x0', '0x' + '0'.repeat(40), payer]) {
    await assert.rejects(transfers.quote(payer, { payee, amountWei: 1n }));
  }
  for (const amountWei of [0n, -1n, 2n ** 256n, '1', undefined]) {
    await assert.rejects(transfers.quote(payer, { payee: first, amountWei }));
  }
  assert.equal(estimates.length, 0);
});

function receiptFixture() {
  const txHash = '0x' + 'a'.repeat(64);
  const blockHash = '0x' + 'b'.repeat(64);
  let transaction = { from: payer, to: first, value: '0x1', input: '0x', nonce: '0x0', blockHash };
  const rpc = async (method, ...params) => {
    if (method === 'eth_chainId') return '0x7a69';
    if (method === 'eth_getBlockByNumber') return params[0] === 'latest' ? { number: '0x1', timestamp: '0x1' } : { number: '0x2', timestamp: '0x2', hash: blockHash };
    if (method === 'eth_getCode') return '0x';
    if (method === 'eth_gasPrice') return '0x2';
    if (method === 'eth_getBalance') return '0xffffffffffffffff';
    if (method === 'eth_getTransactionCount') return '0x0';
    if (method === 'eth_estimateGas') return '0x5208';
    if (method === 'eth_getTransactionByHash') return transaction;
    if (method === 'eth_getTransactionReceipt') return { status: '0x1', transactionHash: txHash, blockHash, blockNumber: '0x2', gasUsed: '0x5208', effectiveGasPrice: '0x2' };
    assert.fail(method);
  };
  return { txHash, transfers: createMerchant(rpc, { chainId: 31337 }), change: update => { transaction = { ...transaction, ...update }; } };
}

test('empty-calldata transfer verifies once per quote with exact receipt cost', async () => {
  const { transfers, txHash } = receiptFixture();
  const a = await transfers.quote(payer, { payee: first, amountWei: 1n });
  const b = await transfers.quote(payer, { payee: first, amountWei: 1n });
  assert.equal((await transfers.verify(a.id, txHash)).networkFee, '0xa410');
  assert.equal((await transfers.verify(a.id, txHash)).state, 'paid');
  await assert.rejects(transfers.verify(b.id, txHash), /already assigned/);
});

test('wrong nonce, amount, recipient or added calldata cannot verify a plain transfer', async () => {
  for (const update of [{ nonce: '0x1' }, { value: '0x2' }, { to: second }, { input: '0x00' }]) {
    const { transfers, txHash, change } = receiptFixture();
    const quote = await transfers.quote(payer, { payee: first, amountWei: 1n });
    change(update);
    await assert.rejects(transfers.verify(quote.id, txHash), /does not pay/);
  }
});
