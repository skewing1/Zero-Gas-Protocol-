import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareReceiptCosts } from './receipt-cost-gate-adapter.mjs';
import { compareVerifiedRuns } from './verified-savings-gate.mjs';
const hash = '0x' + 'ab'.repeat(32);
const receipt = { status:'0x1', gasUsed:'0x5208', effectiveGasPrice:'0x3b9aca00' };
test('Base L1 and additional data fees are represented once', () => {
  const out = prepareReceiptCosts('8453', [{hash,receipt:{...receipt,l1Fee:'0x64'},fees:{additionalDataFeeWei:'25'}}]);
  assert.equal(out.receipts[0].gasUsed,'21000');
  assert.equal(out.receipts[0].effectiveGasPrice,'1000000000');
  assert.equal(out.receipts[0].l1FeeWei,'100');
  assert.equal(out.additionalDataWei,'25');
  assert.equal(out.receiptsVerified,false);
  assert.equal(out.costCoverageVerified,false);
});
test('Arbitrum poster fee is not charged twice', () => {
  const out=prepareReceiptCosts('42161',[{hash,receipt}]);
  assert.equal(out.receipts[0].l1FeeWei,'0');
});
test('missing Base L1 fee fails closed', () => {
  assert.throws(()=>prepareReceiptCosts('8453',[{hash,receipt}]),/Missing Base L1/);
});
test('duplicate hashes fail closed', () => {
  assert.throws(()=>prepareReceiptCosts('1',[{hash,receipt},{hash:hash.toUpperCase().replace('0X','0x'),receipt}]),/Duplicate/);
});
test('adapter cannot turn unverified observations into a savings claim', () => {
  const out=prepareReceiptCosts('1',[{hash,receipt}]);
  const extras=Object.fromEntries(['relayerWei','rpcWei','authorizationWei','deploymentWei','settlementWei','liquidityWei','dataWei','otherWei'].map(k=>[k,'0']));
  const run={...out,workloadHash:hash,paymentCount:1,extraCosts:extras};
  assert.throws(()=>compareVerifiedRuns(run,run),/Unverified payment outcomes or receipts/);
});
