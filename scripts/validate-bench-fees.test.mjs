import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateBench } from './validate-bench-evidence.mjs';

const fixture = () => ['W1','W2','W3','W4'].flatMap(workload =>
  ['native','token'].map(asset => ({
    workload, asset,
    paths: (asset === 'native' ? ['P0','P1','P1-net','P2'] : ['P0','P1','P1-net']).map((path, i) => ({
      path, finalBalances: ['10'],
      receipts: [{ hash: '0x' + (i+1).toString(16).padStart(64, '0'),
        stage: 'settlement', gasUsed: 10, effectiveGasPrice: '2', feeWei: '20' }],
      feeWei: '20', deployment: { feeWei: '0' },
      prefunding: { feeWei: '0' }, lifecycleFeeWei: '20',
    })),
  })));

test('valid receipt components reconcile', () => assert.equal(validateBench(fixture()), true));
test('reject forged receipt fee even when path totals match', () => {
  const x = fixture(); x[0].paths[0].receipts[0].feeWei = '19';
  x[0].paths[0].feeWei = '19'; x[0].paths[0].lifecycleFeeWei = '19';
  assert.throws(() => validateBench(x), /Receipt fee/);
});
test('include L1 data fee', () => {
  const x = fixture(); x[0].paths[0].receipts[0].l1Fee = '3';
  assert.throws(() => validateBench(x), /Receipt fee/);
});
test('include blob fee', () => {
  const x = fixture(); x[0].paths[0].receipts[0].blobGasUsed = '0x2';
  x[0].paths[0].receipts[0].blobGasPrice = '0x3';
  assert.throws(() => validateBench(x), /Receipt fee/);
});
test('reject mismatched blob subtotal', () => {
  const x = fixture(); x[0].paths[0].receipts[0].blobFeeWei = '1';
  assert.throws(() => validateBench(x), /Blob fee/);
});
test('reject unknown stage', () => {
  const x = fixture(); x[0].paths[0].receipts[0].stage = 'mystery';
  assert.throws(() => validateBench(x), /stage/);
});
test('reject malformed gas used', () => {
  const x = fixture(); x[0].paths[0].receipts[0].gasUsed = -1;
  assert.throws(() => validateBench(x), /gas used/);
});
test('reject missing blob price', () => {
  const x = fixture(); x[0].paths[0].receipts[0].blobGasUsed = '0x1';
  assert.throws(() => validateBench(x), /blob price/);
});
