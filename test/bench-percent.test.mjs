import assert from 'node:assert/strict';
import test from 'node:test';

// Independent boundary regression for scripts/bench.mjs integer-exact fee rendering.
const formatBasisPoints = bps => {
  assert(typeof bps === 'bigint' && bps >= 0n, 'Expected nonnegative basis points');
  return (bps / 100n).toString() + '.' + (bps % 100n).toString().padStart(2, '0');
};

test('zero and fractional basis points retain two decimals', () => {
  assert.equal(formatBasisPoints(0n), '0.00');
  assert.equal(formatBasisPoints(1n), '0.01');
  assert.equal(formatBasisPoints(9999n), '99.99');
  assert.equal(formatBasisPoints(10000n), '100.00');
});
test('very large fee ratios do not overflow Number', () => {
  assert.equal(formatBasisPoints(1234567890123456789012345n), '12345678901234567890123.45');
});
test('rejects negative or non-integer inputs', () => {
  assert.throws(() => formatBasisPoints(-1n));
  assert.throws(() => formatBasisPoints(1));
});
