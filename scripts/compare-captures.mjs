#!/usr/bin/env node
// Assemble independently captured receipt costs into a conservative all-in comparison.
// Does not certify finality or economic outcome equivalence.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {compareAllIn} from './compare-all-in.mjs';
const dec = (x, label) => {assert(typeof x==='string' && /^(0|[1-9][0-9]*)$/.test(x), `${label} must be canonical decimal wei`);return x;};
const digest = x => {assert(typeof x==='string' && /^0x[0-9a-fA-F]{64}$/.test(x),'Invalid outcome digest');return x.toLowerCase();};
export function compareCapturedPayments({baselineCapture,candidateCapture,baselineCosts,candidateCosts,baselineOutcomeDigest,candidateOutcomeDigest,thresholdBps=4500}) {
  assert(baselineCapture?.verifiedByTool===false && candidateCapture?.verifiedByTool===false,'Expected raw, uncertified receipt captures');
  const chainId=baselineCapture.chainId;
  assert(/^[1-9][0-9]*$/.test(chainId??'') && candidateCapture.chainId===chainId,'Capture chain mismatch');
  function side(capture,costs,outcomeDigest){
    assert(Array.isArray(capture.receipts)&&capture.receipts.length>0,'Missing captured receipts');
    assert(costs && typeof costs==='object','Missing explicit overhead costs');
    const result={chainId,outcomeDigest:digest(outcomeDigest),receipts:capture.receipts.map(r=>({
      transactionHash:r.transactionHash,canonical:r.canonical,success:r.success,
      executionWei:dec(r.executionWei,'executionWei'),blobWei:dec(r.blobWei,'blobWei'),dataWei:dec(r.dataWei,'dataWei')
    }))};
    for(const field of ['relayerWei','deploymentWei','settlementWei','bridgeWei'])result[field]=dec(costs[field],field);
    return result;
  }
  const result=compareAllIn({baseline:side(baselineCapture,baselineCosts,baselineOutcomeDigest),candidate:side(candidateCapture,candidateCosts,candidateOutcomeDigest),thresholdBps});
  return {...result,verifiedByTool:false,caveat:'Receipt evidence is single-RPC observation, and supplied outcome digests are not independent proof of equal recipient balances. Confirm canonical finality, independent balance snapshots, and complete fees before any savings claim.'};
}
if(process.argv[1]?.endsWith('/compare-captures.mjs')){
  assert(process.argv.length===3,'Usage: node scripts/compare-captures.mjs <manifest.json>');
  const manifest=JSON.parse(await readFile(process.argv[2],'utf8'));
  const [baselineCapture,candidateCapture]=await Promise.all([manifest.baselinePath,manifest.candidatePath].map(async p=>JSON.parse(await readFile(p,'utf8'))));
  console.log(JSON.stringify(compareCapturedPayments({...manifest,baselineCapture,candidateCapture}),null,2));
}
