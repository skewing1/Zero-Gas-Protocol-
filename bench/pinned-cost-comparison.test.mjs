import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { comparePinnedReceiptPaths } from './pinned-cost-comparison.mjs';
const hash = digit => '0x' + digit.repeat(64);
const sample = (a,b) => ({
  path: { chainId: '1', outcome: [{recipient:'0x'+'1'.repeat(40),asset:'native',deltaWei:'1'}] },
  beforeBlock: {hash:hash(a),number:'10'}, afterBlock: {hash:hash(b),number:'11'}
});
const rpc = async () => { throw Error('Unexpected RPC read'); };
test('rejects missing RPC reader', async () => {
  await assert.rejects(comparePinnedReceiptPaths({baseline:sample('a','b'),candidate:sample('c','d')}), /Missing RPC reader/);
});
test('rejects reused observation windows before RPC', async () => {
  await assert.rejects(comparePinnedReceiptPaths({rpc,baseline:sample('a','b'),candidate:sample('a','b')}), /reuse an observation window/);
});
test('rejects reversed block order before RPC', async () => {
  const candidate = sample('c','d'); candidate.afterBlock.number='9';
  await assert.rejects(comparePinnedReceiptPaths({rpc,baseline:sample('a','b'),candidate}), /block order/);
});
test('rejects malformed block hashes before RPC', async () => {
  const candidate=sample('c','d');candidate.beforeBlock.hash='invalid';
  await assert.rejects(comparePinnedReceiptPaths({rpc,baseline:sample('a','b'),candidate}), /block identity/);
});
test('rejects missing evidence before RPC', async () => {
  await assert.rejects(comparePinnedReceiptPaths({rpc,baseline:sample('a','b')}), /Missing candidate evidence/);
});
