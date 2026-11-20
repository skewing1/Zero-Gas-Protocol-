import assert from 'node:assert/strict';
const dec = (x, label) => { assert(typeof x === 'string' && /^(0|[1-9][0-9]*)$/.test(x), label + ': unsigned decimal string required'); return BigInt(x); };
const positive = (x, label) => { const v = dec(x, label); assert(v > 0n, label + ': must be positive'); return v; };
/** Conservative integer-exact economic break-even modeling. Inputs must come from independently verified equivalent-outcome receipts and separately evidenced overhead. Does not attest inputs. */
export function receiptBreakEven({baselineReceiptWei, candidateReceiptWei, baselinePerBatchOverheadWei, candidatePerBatchOverheadWei, baselineSetupWei, candidateSetupWei, amortizationBatches, targetSavingsBps = 4500}) {
  const b = positive(baselineReceiptWei, 'baselineReceiptWei');
  const c = dec(candidateReceiptWei, 'candidateReceiptWei');
  const bo = dec(baselinePerBatchOverheadWei, 'baselinePerBatchOverheadWei');
  const co = dec(candidatePerBatchOverheadWei, 'candidatePerBatchOverheadWei');
  const bs = dec(baselineSetupWei, 'baselineSetupWei');
  const cs = dec(candidateSetupWei, 'candidateSetupWei');
  const batches = positive(amortizationBatches, 'amortizationBatches');
  assert(Number.isSafeInteger(targetSavingsBps) && targetSavingsBps >= 0 && targetSavingsBps <= 10000, 'targetSavingsBps: expected integer in [0,10000]');
  const ceilDiv = (a, n) => (a + n - 1n) / n;
  const baseline = b + bo + ceilDiv(bs, batches);
  const candidate = c + co + ceilDiv(cs, batches);
  const saving = baseline - candidate;
  const savingsBps = saving * 10000n / baseline;
  const maxCandidateTotal = baseline * BigInt(10000 - targetSavingsBps) / 10000n;
  const candidateFixed = c + ceilDiv(cs, batches);
  const maxCandidatePerBatchOverheadWei = maxCandidateTotal >= candidateFixed ? (maxCandidateTotal - candidateFixed).toString() : null;
  return {baselineAllInWei: baseline.toString(), candidateAllInWei: candidate.toString(), savedWei: saving.toString(), savingsBps: savingsBps.toString(), meetsTarget: saving * 10000n >= baseline * BigInt(targetSavingsBps), maxCandidatePerBatchOverheadWei, evidenceLevel: 'MODEL_ONLY_REQUIRES_INDEPENDENT_RECEIPT_AND_COST_VERIFICATION'};
}
