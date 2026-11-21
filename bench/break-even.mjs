// SPDX-License-Identifier: MIT
// Offline sensitivity analysis only. No receipt authentication or network calls.
// Computes the maximum candidate overhead compatible with a STRICT >45% saving.
const DECIMAL = /^(0|[1-9][0-9]*)$/;
function wei(value, name) {
  if (typeof value !== 'string' || !DECIMAL.test(value)) throw new Error(`${name}: expected unsigned decimal wei string`);
  return BigInt(value);
}
export function breakEven(input) {
  if (!input || typeof input !== 'object') throw new Error('missing input');
  const baseline = wei(input.baselineAllInWei, 'baselineAllInWei');
  const candidate = wei(input.candidateReceiptWei, 'candidateReceiptWei');
  const committed = wei(input.candidateKnownOverheadWei, 'candidateKnownOverheadWei');
  if (baseline === 0n) throw new Error('zero baseline');
  // Strict inequality: candidate receipt + committed + remaining < baseline*55/100.
  // Integer wei: maximum allowed total candidate cost = ceil(55*baseline/100)-1.
  const maxCandidate = (55n * baseline + 99n) / 100n - 1n;
  const budget = maxCandidate - candidate - committed;
  return {
    kind: 'UNVERIFIED_COST_SENSITIVITY',
    baselineAllInWei: baseline.toString(),
    candidateReceiptWei: candidate.toString(),
    candidateKnownOverheadWei: committed.toString(),
    maxCandidateTotalWeiForStrict45Percent: maxCandidate.toString(),
    remainingOverheadBudgetWei: (budget > 0n ? budget : 0n).toString(),
    feasibleWithKnownCosts: budget >= 0n,
    limitation: 'Hypothetical supplied values, not evidence of executed EIP-7702 transactions or realized savings.'
  };
}
