import assert from 'node:assert/strict';
import test from 'node:test';
import { encodePayments, epochDomain } from '../dist/epochs.js';
const a = '0x0000000000000000000000000000000000000001';
const b = '0x0000000000000000000000000000000000000002';
test('compact encoding preserves each obligation and aggregates independently', () => {
  const result = encodePayments([{to:a,amount:1n},{to:b,amount:256n},{to:a,amount:(1n<<64n)-1n}]);
  assert.deepEqual(result.recipients, [a,b]);
  assert.equal(result.data, '0x00000000000000000101000000000000010000ffffffffffffffff');
  assert.equal(result.totals.get(a), 1n<<64n);
  assert.equal(result.totals.get(b), 256n);
});
test('rejects truncation, missing payments and unsupported domains', () => {
  for (const amount of [0n,-1n,1n<<64n]) assert.throws(() => encodePayments([{to:a,amount}]));
  assert.throws(() => encodePayments([]));
  assert.throws(() => encodePayments([{to:'0x0000000000000000000000000000000000000000',amount:1n}]));
  assert.throws(() => epochDomain(0,a));
  assert.throws(() => encodePayments(Array.from({length:257}, (_,i) => ({to:'0x'+(i+1).toString(16).padStart(40,'0'),amount:1n}))));
});
