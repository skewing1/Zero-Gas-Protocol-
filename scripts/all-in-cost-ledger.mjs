// Offline receipt-cost ledger. No RPC, signing, or funds movement.
const DEC = /^(0|[1-9][0-9]*)$/;
function nat(x, label) {
  if (typeof x !== 'string' || !DEC.test(x)) throw new Error(label + ': canonical nonnegative integer string required');
  return BigInt(x);
}
function sum(rows, key) { return rows.reduce((n, r) => n + nat(r[key], key), 0n); }
function receipts(rows, label) {
  if (!Array.isArray(rows) || rows.length === 0) throw new Error(label + ': nonempty receipts required');
  const seen = new Set();
  return rows.reduce((total, r) => {
    if (!r || typeof r !== 'object' || !/^0x[0-9a-fA-F]{64}$/.test(r.txHash)) throw new Error('invalid txHash');
    if (seen.has(r.txHash.toLowerCase())) throw new Error('duplicate receipt');
    seen.add(r.txHash.toLowerCase());
    if (r.status !== 'success') throw new Error('failed or unverified receipt');
    const gas = nat(r.gasUsed, 'gasUsed') * nat(r.effectiveGasPriceWei, 'effectiveGasPriceWei');
    // These are ADDITIONAL charges only. Do not repeat L1 fees already included in receipt gasUsed * price.
    return total + gas + nat(r.additionalL1DataFeeWei, 'additionalL1DataFeeWei') + nat(r.additionalBlobFeeWei, 'additionalBlobFeeWei');
  }, 0n);
}
export function compareAllInCost(input) {
  if (!input || typeof input !== 'object') throw new Error('input required');
  const {baseline, candidate} = input;
  function side(s, name) {
    if (!s || typeof s !== 'object') throw new Error(name + ': required');
    const receiptWei = receipts(s.receipts, name);
    const overhead = s.overhead;
    if (!overhead || typeof overhead !== 'object') throw new Error('overhead required');
    const keys = ['relayerCompensationWei','rpcInfrastructureWei','proofAndSettlementWei','deploymentAndAuthorizationWei','otherDataAvailabilityWei'];
    if (Object.keys(overhead).sort().join() !== keys.slice().sort().join()) throw new Error('missing or unknown overhead category');
    const overheadWei = sum([overhead], keys[0]) + keys.slice(1).reduce((n,k)=>n+nat(overhead[k],k),0n);
    return {receiptWei, overheadWei, totalWei:receiptWei+overheadWei};
  }
  // Outcome fingerprint must be independently generated from verified post-state, not user-declared equivalence.
  if (typeof input.verifiedOutcomeDigest !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(input.verifiedOutcomeDigest)) throw new Error('verified outcome digest required');
  if (baseline?.outcomeDigest?.toLowerCase() !== input.verifiedOutcomeDigest.toLowerCase() || candidate?.outcomeDigest?.toLowerCase() !== input.verifiedOutcomeDigest.toLowerCase()) throw new Error('outcome mismatch');
  const b=side(baseline,'baseline'), c=side(candidate,'candidate');
  if (b.totalWei === 0n) throw new Error('zero baseline cost');
  const savingsBps=(b.totalWei-c.totalWei)*10000n/b.totalWei;
  return Object.freeze({baselineWei:b.totalWei.toString(),candidateWei:c.totalWei.toString(),receiptBaselineWei:b.receiptWei.toString(),receiptCandidateWei:c.receiptWei.toString(),savingsBps:savingsBps.toString(),above45Percent:savingsBps>4500n, evidenceLevel:'UNATTESTED_INPUTS_NOT_VERIFIED_SAVINGS'});
}
