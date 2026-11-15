import test from 'node:test';
import assert from 'node:assert/strict';
import { receiptCost, allInCost, compareCosts } from './fee-accounting.mjs';
const receipt = (gasUsed, effectiveGasPrice, extras = {}) =>
  ({ status: '0x1', gasUsed, effectiveGasPrice, ...extras });

test('counts execution, L1 data and blob fees exactly', () => {
  assert.equal(receiptCost(receipt('21000', '2000000000', { l1Fee: '300', blobFee: '700' })), '42000000001000');
});
test('accepts genuine RPC hex quantities and converts to decimal wei', () => {
  assert.equal(receiptCost(receipt('0x5208', '0x77359400', {l1Fee:'0x12c', blobFee:'0x2bc'})), '42000000001000');
  assert.equal(receiptCost(receipt('0x0','0x0')), '0');
});
test('counts all explicit overhead categories', () => {
  assert.deepEqual(allInCost({ receipts: [receipt('10','3'), receipt('20','4')],
    relayerWei:'5', proofWei:'6', bridgingWei:'7', infrastructureWei:'8', amortizedDeploymentWei:'9' }),
    {onchainWei:'110', overheadWei:'35', totalWei:'145', transactionCount:2});
});
test('45% threshold is measured against all-in baseline', () => {
  assert.deepEqual(compareCosts({totalWei:'1000'}, {totalWei:'550'}),
    {savingsBasisPoints:'4500', meets45Percent:true, deltaWei:'450'});
  assert.equal(compareCosts({totalWei:'1000'}, {totalWei:'551'}).meets45Percent,false);
  assert.equal(compareCosts({totalWei:'1000'}, {totalWei:'1100'}).savingsBasisPoints,'-1000');
});
test('large wei amounts remain exact', () => {
  const huge='100000000000000000000000000000000000';
  assert.equal(receiptCost(receipt(huge,'2')), (BigInt(huge)*2n).toString());
});
test('rejects failed, missing, malformed, negative, and noncanonical RPC quantities', () => {
  assert.throws(()=>receiptCost(receipt('1','1',{status:'0x0'})),/successful/);
  for (const bad of ['-1','1.5','0x','0x00','0x01','0x-1','0X1',1])
    assert.throws(()=>receiptCost(receipt(bad,'1')),/canonical/);
  assert.throws(()=>allInCost({receipts:[],relayerWei:'-1'}),/canonical/);
  assert.throws(()=>compareCosts({totalWei:'0'},{totalWei:'0'}),/positive/);
});
