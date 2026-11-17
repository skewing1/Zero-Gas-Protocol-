// Offline exact-wei headroom calculator for strictly greater than 45% total savings.
// No receipts, RPC, transfers, or verified savings claims.
const DEC=/^(0|[1-9][0-9]*)$/;
function nat(v,label){if(typeof v!=='string'||!DEC.test(v))throw Error(label+': canonical nonnegative wei required');return BigInt(v)}
export function maximumIncrementalCandidateOverhead({baselineTotalWei,candidateKnownTotalWei,paymentCount}){
 const b=nat(baselineTotalWei,'baselineTotalWei'),c=nat(candidateKnownTotalWei,'candidateKnownTotalWei'),n=nat(paymentCount,'paymentCount');
 if(b===0n||n===0n)throw Error('positive baseline and paymentCount required');
 // Strict saving >45%: candidate total * 100 < baseline total * 55.
 // Largest permissible integer candidate total = floor((55*b-1)/100).
 const ceiling=(55n*b-1n)/100n;
 const remaining=ceiling-c;
 return Object.freeze({baselineWei:b.toString(),candidateKnownWei:c.toString(),paymentCount:n.toString(),
  maximumTotalCandidateWei:ceiling.toString(),
  maximumAdditionalOverheadWei:remaining>=0n?remaining.toString():'0',
  targetStillFeasible:remaining>=0n,
  knownSavingsBps:((b-c)*10000n/b).toString(),
  evidenceLevel:'MODELED_BUDGET_ONLY_NO_RECEIPT_OR_OUTCOME_ATTESTATION',verifiedAbove45Percent:false});
}
