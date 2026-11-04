import test from 'node:test';
import assert from 'node:assert/strict';

// Executable specification counterexamples, NOT contract or SP1 verification.
test('stale independent exit can invalidate a completed cross-origin swap', () => {
  const portal = { A: 100n, B: 100n };
  const lastA = { alice: 100n, bob: 0n };
  // Canonical hub atomically swaps Alice's A asset for Bob's B asset.
  const latest = { A: { alice: 0n, bob: 100n }, B: { alice: 100n, bob: 0n } };
  // A has not received the new root. B has. Both independently time out.
  portal.A -= lastA.alice;
  portal.B -= latest.B.alice;
  assert.equal(portal.A, 0n);
  assert.equal(portal.B, 0n);
  assert.equal(latest.A.bob, 100n);
  assert(portal.A < latest.A.bob, 'Bob cannot redeem the A asset he received');
  // These are distinct origins; no fungibility or forged proof is assumed.
});

test('a newer root alone does not establish forced-queue progress', () => {
  const forced = { index: 0, requestedBlock: 10 };
  const root = { arrivedAt: 100, processedCursor: 0 };
  const currentBlock = 100;
  const delay = 20;
  const timedOut = currentBlock - root.arrivedAt > delay;
  const matureUnprocessed = currentBlock - forced.requestedBlock >= delay && root.processedCursor <= forced.index;
  assert.equal(timedOut, false);
  assert.equal(matureUnprocessed, true);
});

test('committed amount cap does not bound mark-to-market loss without a price rule', () => {
  const capUnits = 100n;
  const maximumUnitsCredited = capUnits;
  const valuationBefore = 1n;
  const valuationAfter = 10n;
  assert.equal(maximumUnitsCredited * valuationAfter, 10n * capUnits * valuationBefore);
  // A cap is a bound in asset units, not automatically a USD loss bound.
});
