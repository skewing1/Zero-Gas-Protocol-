// Read-only bridge: dual-RPC observations -> all-in cost ledger.
// No outcome proof, provider-independence proof, or chain-specific L1 fee attestation.
import {compareAllInCost} from './all-in-cost-ledger.mjs';
const DEC=/^(0|[1-9][0-9]*)$/;
const HASH=/^0x[0-9a-fA-F]{64}$/;
const LEVEL='TWO_RPC_AGREEMENT_PROVIDER_INDEPENDENCE_NOT_ATTESTED';
function nat(value,name) {
  if (typeof value!=='string'||!DEC.test(value)) throw new Error(name+': canonical decimal required');
  return BigInt(value);
}
function side(s,name,chainId) {
  if (!s || !Array.isArray(s.observations) || !Array.isArray(s.fees) ||
      !s.observations.length || s.observations.length!==s.fees.length) throw new Error(name+': one fee entry per observation required');
  const byHash=new Map();
  for (const fee of s.fees) {
    if (!fee || !HASH.test(fee.txHash)) throw new Error(name+': invalid fee txHash');
    const key=fee.txHash.toLowerCase();
    if (byHash.has(key)) throw new Error(name+': duplicate fee txHash');
    nat(fee.additionalL1DataFeeWei,'additionalL1DataFeeWei');
    nat(fee.additionalBlobFeeWei,'additionalBlobFeeWei');
    byHash.set(key,fee);
  }
  const seen=new Set();
  const receipts=s.observations.map(o=>{
    if (!o || o.evidenceLevel!==LEVEL || o.verifiedSavingsEligible!==false ||
        o.outcomeVerified!==false || o.fullCostVerified!==false) throw new Error(name+': invalid corroboration evidence');
    if (o.chainId!==chainId || !HASH.test(o.txHash) || !HASH.test(o.blockHash)) throw new Error(name+': invalid chain or hash');
    const key=o.txHash.toLowerCase();
    if (seen.has(key)) throw new Error(name+': duplicate observation');
    seen.add(key);
    const fee=byHash.get(key);
    if (!fee) throw new Error(name+': unmatched fee');
    const gas=nat(o.gasUsed,'gasUsed'),price=nat(o.effectiveGasPriceWei,'effectiveGasPriceWei');
    if (gas*price!==nat(o.executionFeeWei,'executionFeeWei')) throw new Error(name+': inconsistent execution fee');
    if (nat(o.minimumObservedConfirmations,'minimumObservedConfirmations')<1n) throw new Error(name+': insufficient confirmations');
    return {txHash:key,status:'success',gasUsed:gas.toString(),effectiveGasPriceWei:price.toString(),
      additionalL1DataFeeWei:fee.additionalL1DataFeeWei,additionalBlobFeeWei:fee.additionalBlobFeeWei};
  });
  return {receipts,overhead:s.overhead,outcomeDigest:s.outcomeDigest};
}
export function compareCorroboratedAllInCost({chainId,baseline,candidate,verifiedOutcomeDigest}) {
  if (typeof chainId!=='string'||!DEC.test(chainId)) throw new Error('invalid chainId');
  const result=compareAllInCost({
    baseline:side(baseline,'baseline',chainId),
    candidate:side(candidate,'candidate',chainId),
    verifiedOutcomeDigest
  });
  return Object.freeze({...result,evidenceLevel:'DUAL_RPC_RECEIPTS_PLUS_UNATTESTED_FEES_AND_OUTCOMES',
    verifiedAbove45Percent:false});
}
