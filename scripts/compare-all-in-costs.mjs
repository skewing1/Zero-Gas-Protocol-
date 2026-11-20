// Offline, conservative equivalent-outcome economics check; no RPC or production writes.
import {readFileSync} from 'node:fs';
const integer=(v,k)=>{if(typeof v!=='string'||!/^(0|[1-9][0-9]*)$/.test(v))throw Error(k+' must be canonical unsigned wei string');return BigInt(v)};
export function compareAllInCosts({paths}){
 if(!Array.isArray(paths)||paths.length!==2||paths[0].id!=='baseline'||paths[1].id!=='candidate')throw Error('Expected baseline and candidate');
 const check=p=>{
  const outcomes=new Map();if(!Array.isArray(p.outcomes)||!p.outcomes.length)throw Error('Missing outcomes');
  for(const o of p.outcomes){const a=o.recipient?.toLowerCase();if(!/^0x[0-9a-f]{40}$/.test(a)||outcomes.has(a))throw Error('Invalid/duplicate recipient');outcomes.set(a,integer(o.receivedWei,'receivedWei').toString())}
  if(!Array.isArray(p.receipts)||!p.receipts.length)throw Error('Missing receipts');
  let receipts=0n;const hashes=new Set();
  for(const r of p.receipts){const h=r.transactionHash?.toLowerCase();if(!/^0x[0-9a-f]{64}$/.test(h)||hashes.has(h)||r.status!=='success')throw Error('Invalid, duplicate or unsuccessful receipt');hashes.add(h);receipts+=integer(r.gasUsed,'gasUsed')*integer(r.effectiveGasPriceWei,'effectiveGasPriceWei')+integer(r.l1DataFeeWei,'l1DataFeeWei')+integer(r.blobFeeWei,'blobFeeWei')}
  let extra=0n;const missing=[];for(const k of ['relayerOperatingCostWei','deploymentCostWei','settlementCostWei','otherCostWei']){if(p[k]===null)missing.push(p.id+'.'+k);else extra+=integer(p[k],k)}
  return {outcomes,receipts,total:receipts+extra,missing}
 };
 const a=check(paths[0]),b=check(paths[1]);if(a.outcomes.size!==b.outcomes.size||[...a.outcomes].some(([k,v])=>b.outcomes.get(k)!==v))throw Error('Recipient outcomes differ');
 const missingCosts=[...a.missing,...b.missing],verifiedAllIn=missingCosts.length===0;
 const savingsBasisPoints=verifiedAllIn&&a.total>0n?((a.total-b.total)*10000n/a.total).toString():null;
 return {equivalentOutcomes:true,baselineReceiptWei:a.receipts.toString(),candidateReceiptWei:b.receipts.toString(),baselineKnownCostWei:a.total.toString(),candidateKnownCostWei:b.total.toString(),missingCosts,verifiedAllIn,savingsBasisPoints,exceeds45Percent:savingsBasisPoints===null?null:BigInt(savingsBasisPoints)>4500n};
}
if(process.argv[1]?.endsWith('compare-all-in-costs.mjs')&&process.argv[2]){try{console.log(JSON.stringify(compareAllInCosts(JSON.parse(readFileSync(process.argv[2],'utf8'))),null,2))}catch(e){console.error(e.message);process.exitCode=1}}
