import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyMinedReceipt } from './verify-mined-receipt.mjs';
const h = n => '0x' + n.repeat(64);
const fixture = () => ({
  receipt: {transactionHash:h('a'),status:'0x1',blockNumber:'0x1',blockHash:h('b'),
    gasUsed:'0x5208',effectiveGasPrice:'0x3b9aca00'},
  tx: {hash:h('a'),blockHash:h('b'),chainId:'0x7a69'}
});
test('successful receipt computes exact wei', () => {
  const {receipt,tx}=fixture();
  assert.equal(verifyMinedReceipt(receipt,tx,h('a'),31337n).feeWei,21000000000000n);
});
test('rollup and blob fees are added exactly', () => {
  const {receipt,tx}=fixture();
  Object.assign(receipt,{l1Fee:'0x64',blobGasUsed:'0x2',blobGasPrice:'0x3'});
  assert.equal(verifyMinedReceipt(receipt,tx,h('a'),31337n).feeWei,21000000000106n);
});
for (const [name,change] of [
  ['failed transaction', (r,t)=>{r.status='0x0'}],
  ['missing status', (r,t)=>{delete r.status}],
  ['receipt hash mismatch', (r,t)=>{r.transactionHash=h('c')}],
  ['transaction hash mismatch', (r,t)=>{t.hash=h('c')}],
  ['block hash mismatch', (r,t)=>{t.blockHash=h('c')}],
  ['chain mismatch', (r,t)=>{t.chainId='0x1'}],
  ['missing block', (r,t)=>{r.blockNumber='0x0'}],
  ['noncanonical quantity', (r,t)=>{r.gasUsed='21000'}],
  ['missing gas price', (r,t)=>{delete r.effectiveGasPrice}],
  ['incomplete blob fee', (r,t)=>{r.blobGasUsed='0x2'}],
  ['zero gas', (r,t)=>{r.gasUsed='0x0'}],
]) {
  test('rejects '+name,()=>{
    const {receipt,tx}=fixture(); change(receipt,tx);
    assert.throws(()=>verifyMinedReceipt(receipt,tx,h('a'),31337n));
  });
}
