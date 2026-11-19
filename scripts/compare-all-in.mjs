#!/usr/bin/env node
// Conservative all-in arithmetic. Evidence must be independently verified.
import assert from 'node:assert/strict';
const wei=(v,name)=>{assert(typeof v==='string' && /^(0|[1-9][0-9]*)$/.test(v),name+' must be nonnegative decimal wei');return BigInt(v)};
export function compareAllIn({baseline,candidate,thresholdBps=4500}){
  assert(Number.isInteger(thresholdBps)&&thresholdBps>=0&&thresholdBps<=10000,'Invalid threshold');
  assert(baseline?.chainId===candidate?.chainId,'Different settlement chains');
  assert(/^[1-9][0-9]*$/.test(baseline?.chainId??''),'Invalid chain ID');
  assert(/^0x[0-9a-fA-F]{64}$/.test(baseline?.outcomeDigest??''),'Missing outcome digest');
  assert(baseline.outcomeDigest.toLowerCase()===candidate?.outcomeDigest?.toLowerCase(),'Different payment outcomes');
  function total(side,name){
    assert(Array.isArray(side.receipts)&&side.receipts.length>0,name+' receipt evidence missing');
    const hashes=new Set();let cost=0n;
    for(const r of side.receipts){
      assert(/^0x[0-9a-fA-F]{64}$/.test(r.transactionHash??''),name+' invalid transaction hash');
      const h=r.transactionHash.toLowerCase();
      assert(!hashes.has(h),name+' duplicate transaction hash');hashes.add(h);
      assert(r.canonical===true&&r.success===true,name+' receipt not verified successful and canonical');
      for(const field of ['executionWei','blobWei','dataWei'])cost+=wei(r[field],name+' '+field);
    }
    // relayerWei excludes gas already counted from mined receipts.
    for(const field of ['relayerWei','deploymentWei','settlementWei','bridgeWei'])cost+=wei(side[field],name+' '+field);
    return cost;
  }
  const b=total(baseline,'baseline'),c=total(candidate,'candidate');
  assert(b>0n,'Zero baseline cost');
  const saved=b-c;
  return {baselineWei:b.toString(),candidateWei:c.toString(),savingsWei:saved.toString(),
    savingsBps:(saved*10000n/b).toString(),
    meetsTarget:saved>=0n&&saved*10000n>BigInt(thresholdBps)*b,
    verifiedByTool:false,
    caveat:'Arithmetic only. Canonical receipts, complete L2 fees, outcome equivalence, and non-overlapping cost categories require independent verification.'};
}
if(process.argv[1]?.endsWith('/compare-all-in.mjs')){
  const fs=await import('node:fs/promises');
  assert(process.argv.length===3,'Usage: node scripts/compare-all-in.mjs <evidence.json>');
  console.log(JSON.stringify(compareAllIn(JSON.parse(await fs.readFile(process.argv[2],'utf8'))),null,2));
}
