import test from 'node:test';
import assert from 'node:assert/strict';
import {compareCorroboratedAllInCost} from './receipt-cost-evidence-bridge.mjs';
const hash=n=>'0x'+n.toString(16).padStart(64,'0');
const digest=hash(90);
function observation(n,gas='21000') {
  return {chainId:'8453',txHash:hash(n),blockHash:hash(n+10),gasUsed:gas,
    effectiveGasPriceWei:'100',executionFeeWei:(BigInt(gas)*100n).toString(),
    minimumObservedConfirmations:'12',evidenceLevel:'TWO_RPC_AGREEMENT_PROVIDER_INDEPENDENCE_NOT_ATTESTED',
    outcomeVerified:false,fullCostVerified:false,verifiedSavingsEligible:false};
}
const overhead=()=>({relayerCompensationWei:'0',rpcInfrastructureWei:'0',
  proofAndSettlementWei:'0',deploymentAndAuthorizationWei:'0',otherDataAvailabilityWei:'0'});
function side(n,gas) {
  return {observations:[observation(n,gas)],fees:[{txHash:hash(n),
    additionalL1DataFeeWei:'0',additionalBlobFeeWei:'0'}],overhead:overhead(),outcomeDigest:digest};
}
const fixture=()=>({chainId:'8453',baseline:side(1,'100000'),candidate:side(2,'40000'),verifiedOutcomeDigest:digest});
test('computes modeled savings but never verified savings',()=>{
  const r=compareCorroboratedAllInCost(fixture());
  assert.equal(r.modeledAbove45Percent,true);
  assert.equal(r.verifiedAbove45Percent,false);
  assert.equal(r.savingsBps,'6000');
});
test('rejects execution fee arithmetic mismatch',()=>{
  const f=fixture();f.candidate.observations[0].executionFeeWei='1';
  assert.throws(()=>compareCorroboratedAllInCost(f),/inconsistent execution fee/);
});
test('rejects missing or substituted fee record',()=>{
  const f=fixture();f.candidate.fees[0].txHash=hash(3);
  assert.throws(()=>compareCorroboratedAllInCost(f),/unmatched fee/);
});
test('rejects duplicate observations',()=>{
  const f=fixture();f.candidate.observations.push(observation(2,'40000'));
  f.candidate.fees.push({txHash:hash(3),additionalL1DataFeeWei:'0',additionalBlobFeeWei:'0'});
  assert.throws(()=>compareCorroboratedAllInCost(f),/duplicate observation/);
});
test('rejects cross-chain evidence',()=>{
  const f=fixture();f.candidate.observations[0].chainId='1';
  assert.throws(()=>compareCorroboratedAllInCost(f),/invalid chain or hash/);
});
test('rejects forged verification flags',()=>{
  const f=fixture();f.candidate.observations[0].verifiedSavingsEligible=true;
  assert.throws(()=>compareCorroboratedAllInCost(f),/invalid corroboration evidence/);
});
test('rejects inconsistent outcome digest',()=>{
  const f=fixture();f.candidate.outcomeDigest=hash(91);
  assert.throws(()=>compareCorroboratedAllInCost(f),/outcome mismatch/);
});
test('charges additional L1 data fees and can reverse modeled savings',()=>{
  const f=fixture();f.candidate.fees[0].additionalL1DataFeeWei='10000000';
  const r=compareCorroboratedAllInCost(f);
  assert.equal(r.modeledAbove45Percent,false);
  assert.equal(r.verifiedAbove45Percent,false);
});
test('rejects negative or noncanonical fees',()=>{
  const f=fixture();f.baseline.fees[0].additionalBlobFeeWei='-1';
  assert.throws(()=>compareCorroboratedAllInCost(f),/canonical decimal/);
});
