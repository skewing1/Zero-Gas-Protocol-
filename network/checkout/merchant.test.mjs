import assert from 'node:assert/strict';
import test from 'node:test';
import { createMerchant } from './merchant.mjs';

const payer = '0x0000000000000000000000000000000000000001';
const first = '0x0000000000000000000000000000000000000002';
const second = '0x0000000000000000000000000000000000000003';
const fixture = () => {
  const estimates = [];
  const rpc = async (method, ...params) => {
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
