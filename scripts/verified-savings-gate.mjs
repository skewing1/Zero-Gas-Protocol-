// A deliberately strict claim gate. This module cannot manufacture missing cost evidence.
const decimal = /^(0|[1-9][0-9]*)$/;
function wei(value, name) {
  if (typeof value !== 'string' || !decimal.test(value)) throw new Error(name + ' must be an unsigned decimal wei string');
  return BigInt(value);
}
function requireEvidence(run) {
  if (!run || typeof run !== 'object') throw new Error('Missing run');
  if (run.outcomeVerified !== true || run.receiptsVerified !== true) throw new Error('Unverified payment outcomes or receipts');
  if (typeof run.chainId !== 'string' || !/^[1-9][0-9]*$/.test(run.chainId)) throw new Error('Missing chain ID');
  if (typeof run.workloadHash !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(run.workloadHash)) throw new Error('Missing workload hash');
  if (!Number.isSafeInteger(run.paymentCount) || run.paymentCount < 1) throw new Error('Invalid payment count');
  if (!Array.isArray(run.receipts) || run.receipts.length === 0) throw new Error('No mined receipts');
  const seen = new Set();
  let receiptFees = 0n;
  for (const r of run.receipts) {
    if (!r || !/^0x[0-9a-fA-F]{64}$/.test(r.hash || '') || seen.has(r.hash.toLowerCase())) throw new Error('Missing or duplicate transaction hash');
    seen.add(r.hash.toLowerCase());
    if (r.status !== '0x1') throw new Error('Unsuccessful transaction');
    const execution = wei(r.gasUsed, 'gasUsed') * wei(r.effectiveGasPrice, 'effectiveGasPrice');
    const l1 = wei(r.l1FeeWei, 'l1FeeWei');
    const blob = wei(r.blobFeeWei, 'blobFeeWei');
    receiptFees += execution + l1 + blob;
  }
  if (!run.extraCosts || typeof run.extraCosts !== 'object') throw new Error('Missing extra-cost evidence');
  const keys = ['relayerWei','rpcWei','authorizationWei','deploymentWei','settlementWei','liquidityWei','dataWei','otherWei'];
  let extra = 0n;
  for (const key of keys) extra += wei(run.extraCosts[key], key);
  // Costs must be non-overlapping. In particular, deployment receipts must not be charged twice.
  if (run.extraCosts.deploymentWei !== '0' && run.deploymentReceiptsIncluded === true) throw new Error('Double-counted deployment');
  if (run.costCoverageVerified !== true) throw new Error('Cost completeness not independently verified');
  return receiptFees + extra;
}
export function compareVerifiedRuns(baseline, candidate) {
  const b = requireEvidence(baseline);
  const c = requireEvidence(candidate);
  if (baseline.chainId !== candidate.chainId || baseline.workloadHash.toLowerCase() !== candidate.workloadHash.toLowerCase() || baseline.paymentCount !== candidate.paymentCount) throw new Error('Non-equivalent workloads');
  // The same transaction cannot independently evidence both benchmark arms.
  const baselineHashes = new Set(baseline.receipts.map(r => r.hash.toLowerCase()));
  if (candidate.receipts.some(r => baselineHashes.has(r.hash.toLowerCase()))) throw new Error('Reused receipt across benchmark arms');
  if (b === 0n) throw new Error('Zero baseline cost');
  // Floor signed savings so a loss is never understated by truncation toward zero.
  const delta = (b - c) * 10000n;
  const savingsBps = delta >= 0n ? delta / b : -((-delta + b - 1n) / b);
  return { baselineWei: b.toString(), candidateWei: c.toString(), savingsBps: savingsBps.toString(), exceeds45Percent: c * 100n < b * 55n, modeledExceeds45Percent: c * 100n < b * 55n, claimableSavingsAbove45Percent: false, evidenceChecksPassed: true, verified: false };
}
