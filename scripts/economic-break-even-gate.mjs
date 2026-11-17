// Offline, non-attesting economics gate. No RPC, signing, or transfers.
// All values are canonical integer wei strings. Fees are incremental and must not double-count.
const DEC = /^(0|[1-9][0-9]*)$/;
const KEYS = ['executionWei','l1DataWei','blobWei','relayerWei','rpcWei','authorizationWei','deploymentWei','settlementWei','liquidityWei','otherWei'];
function nat(v, field) {
  if (typeof v !== 'string' || !DEC.test(v)) throw new Error(field + ': canonical wei integer required');
  return BigInt(v);
}
function cost(s, name) {
  if (!s || typeof s !== 'object' || Array.isArray(s) ||
      Object.keys(s).sort().join('|') !== KEYS.slice().sort().join('|'))
    throw new Error(name + ': exact cost categories required');
  return KEYS.reduce((sum,k) => sum + nat(s[k], name+'.'+k), 0n);
}
export function evaluateBreakEven({baseline,candidate,paymentCount,equivalentOutcomeAttested=false}) {
  const n=nat(paymentCount,'paymentCount');
  if (n===0n) throw new Error('paymentCount must be positive');
  const b=cost(baseline,'baseline'), c=cost(candidate,'candidate');
  if (b===0n) throw new Error('baseline must be positive');
  // Integer-only comparisons avoid floating-point false positives near 45%.
  const saved=b-c;
  const exceeds45=saved*100n>b*45n;
  const savingsBps=(saved*10000n/b).toString();
  // Caller-supplied attestations are not sufficient proof; never label modeled inputs verified.
  return Object.freeze({
    paymentCount:n.toString(),baselineWei:b.toString(),candidateWei:c.toString(),
    savedWei:saved.toString(),savingsBps,modeledAbove45Percent:exceeds45,
    perPaymentBaselineWei:(b/n).toString(),perPaymentCandidateWei:(c/n).toString(),
    equivalentOutcomeClaimed:equivalentOutcomeAttested===true,
    verifiedAbove45Percent:false,evidenceLevel:'USER_SUPPLIED_COSTS_NOT_RECEIPT_ATTESTED'
  });
}
export const COST_KEYS=Object.freeze([...KEYS]);
