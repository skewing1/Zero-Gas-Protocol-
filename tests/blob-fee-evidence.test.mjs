import test from 'node:test';
import assert from 'node:assert/strict';
import { blobFeeFromReceipt } from '../scripts/blob-fee-evidence.mjs';

test('non-blob receipt does not invent a blob fee', () => {
  assert.equal(blobFeeFromReceipt({ gasUsed: '0x5208' }), undefined);
});
test('blob fee uses exact bigint arithmetic for JSON-RPC quantities', () => {
  assert.equal(blobFeeFromReceipt({ blobGasUsed: '0x20000', blobGasPrice: '0x3b9aca00' }), '131072000000000');
});
test('incomplete blob evidence fails closed', () => {
  assert.throws(() => blobFeeFromReceipt({ blobGasUsed: '0x20000' }), /Incomplete blob fee evidence/);
  assert.throws(() => blobFeeFromReceipt({ blobGasPrice: '0x1' }), /Incomplete blob fee evidence/);
});
test('rejects invalid or negative quantities', () => {
  assert.throws(() => blobFeeFromReceipt({ blobGasUsed: '-1', blobGasPrice: '0x1' }), /unsigned quantity/);
});
