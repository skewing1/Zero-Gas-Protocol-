import assert from 'node:assert/strict';
import test from 'node:test';
import { encodePayments, epochDomain } from '../dist/epochs.js';
const a = '0x0000000000000000000000000000000000000001';
const b = '0x0000000000000000000000000000000000000002';
test('compact encoding preserves each obligation and aggregates independently', () => {
  const result = encodePayments([{to:a,amount:1n},{to:b,amount:256n},{to:a,amount:(1n<<64n)-1n}]);
  assert.deepEqual(result.recipients, [a,b]);
  assert.equal(result.data, '0x00000001000300000000000000000101000000000000010000ffffffffffffffff');
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

test('periodic encoding reconstructs the exact original sequence', () => {
  const pattern = [{to:a,amount:7n},{to:b,amount:11n},{to:a,amount:19n}];
  const source = Array.from({length:12},(_,i)=>pattern[i%3]);
  const result = encodePayments(source);
  assert.equal(result.patternLength,3); assert.equal(result.repetitions,4);
  assert.equal(result.paymentCount,12);
  const bytes = Buffer.from(result.data.slice(2),'hex');
  assert.equal(bytes.readUInt32BE(0),4); assert.equal(bytes.readUInt16BE(4),3);
  const restored = [];
  for(let repeat=0; repeat<4; repeat++) for(let i=0; i<3; i++) {
    restored.push({to:result.recipients[bytes[6+i*9]],amount:bytes.readBigUInt64BE(7+i*9)});
  }
  assert.deepEqual(restored,source);
  assert.equal(epochDomain(31337,a).version,'2');
});
test('irregular sequences retain all records and partial periods never truncate', () => {
  for (let length=1; length<120; length++) {
    const source=Array.from({length},(_,i)=>({to:i%2?a:b,amount:BigInt((i*i+3*i)%101+1)}));
    const result=encodePayments(source);
    assert.equal(result.patternLength*result.repetitions,length);
    const bytes=Buffer.from(result.data.slice(2),'hex');
    for(let i=0;i<length;i++) {
      const offset=6+(i%result.patternLength)*9;
      assert.equal(result.recipients[bytes[offset]],source[i].to);
      assert.equal(bytes.readBigUInt64BE(offset+1),source[i].amount);
    }
  }
});
