import test from 'node:test';
import assert from 'node:assert/strict';
import { Hub, Portal } from './escape.mjs';
function setup(amount = 100n) {
  const h = new Hub(), a = new Portal('A'), b = new Portal('B');
  for (const [p, owner] of [[a,'alice'],[b,'bob']]) { h.addOrigin(p.id); h.importDeposit(p, p.deposit(owner, amount)); p.acceptVerifiedExport(h.export(p.id)); }
  return { h, a, b };
}
function freeze(h, p) { h.requestEscape(p.id, 1, 10); p.acceptVerifiedExport(h.freeze(p.id, 11)); }
test('stale portal cannot pay Alice; canonical escape pays Bob after swap', () => {
  const {h,a,b} = setup(); h.swap('A','alice',100n,'B','bob',100n);
  assert.throws(() => a.exit('alice'), /canonical freeze/);
  freeze(h,a); freeze(h,b);
  assert.equal(a.exit('alice'),0n); assert.equal(a.exit('bob'),100n);
  assert.equal(b.exit('alice'),100n); assert.equal(b.exit('bob'),0n);
  assert.equal(a.holdings+b.holdings,0n);
});
test('freeze wins race: later swap rejects atomically', () => {
  const {h,a,b} = setup(); freeze(h,a);
  const before = h.export('B');
  assert.throws(() => h.swap('A','alice',100n,'B','bob',100n), /frozen/);
  assert.deepEqual(h.export('B'),before); freeze(h,b);
  assert.equal(a.exit('alice'),100n); assert.equal(b.exit('bob'),100n);
});
test('claims before freeze, unclaimed withdrawals, and pending deposits reconcile', () => {
  const {h,a} = setup(); h.withdraw('A','alice',30n,'w1'); h.withdraw('A','alice',20n,'w2');
  a.acceptVerifiedExport(h.export('A')); assert.equal(a.claim('w1'),30n);
  const pending = a.deposit('carol',17n); freeze(h,a);
  assert.equal(a.exit('alice'),50n); assert.equal(a.claim('w2'),20n); assert.equal(a.refund(pending),17n);
  assert.equal(a.holdings,0n);
  for (const attempt of [()=>a.claim('w1'),()=>a.claim('w2'),()=>a.exit('alice'),()=>a.refund(pending),()=>a.refund(0)]) assert.throws(attempt);
});
test('forced deadline cannot be postponed; early freeze and stale exports fail', () => {
  const {h,a} = setup(); h.requestEscape('A',1,10); h.requestEscape('A',100,10);
  assert.throws(()=>h.freeze('A',10));
  a.acceptVerifiedExport(h.freeze('A',11));
  assert.throws(()=>a.acceptVerifiedExport(h.export('A')));
  assert.throws(()=>h.importDeposit(a,0));
});
test('500 amounts and both transaction orderings preserve redeemability', () => {
  for (let i=1n;i<=500n;i++) for (const swapFirst of [true,false]) {
    const {h,a,b} = setup(i);
    if (swapFirst) h.swap('A','alice',i,'B','bob',i);
    freeze(h,a);
    if (!swapFirst) assert.throws(()=>h.swap('A','alice',i,'B','bob',i));
    freeze(h,b);
    assert.equal(a.exit(swapFirst?'bob':'alice'),i);
    assert.equal(b.exit(swapFirst?'alice':'bob'),i);
    assert.equal(a.holdings+b.holdings,0n);
  }
});
