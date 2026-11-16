import test from 'node:test';
import assert from 'node:assert/strict';
import { calldataGas, basicTransactionIntrinsicGas, pricedCalldataWei } from './calldata-gas.mjs';

test('empty data', () => assert.deepEqual(calldataGas('0x'), { zeroBytes: 0n, nonzeroBytes: 0n, gas: 0n }));
test('zero and nonzero bytes', () => assert.deepEqual(calldataGas('0x000102ff'), { zeroBytes: 1n, nonzeroBytes: 3n, gas: 52n }));
test('case insensitive hex', () => assert.equal(calldataGas('0xAAff').gas, 32n));
test('basic intrinsic transaction cost', () => assert.equal(basicTransactionIntrinsicGas('0x00ff'), 21020n));
test('creation base cost', () => assert.equal(basicTransactionIntrinsicGas('0x', { contractCreation: true }), 53000n));
test('exact wei multiplication', () => assert.equal(pricedCalldataWei('0x0001', 2000000000n), 40000000000n));
for (const bad of ['', '00', '0x0', '0xgg', '0x001', '0x 00', null, 12]) {
  test(`reject malformed calldata ${String(bad)}`, () => assert.throws(() => calldataGas(bad), TypeError));
}
test('reject unknown or negative price', () => {
  assert.throws(() => pricedCalldataWei('0x', undefined), TypeError);
  assert.throws(() => pricedCalldataWei('0x', -1n), TypeError);
});
