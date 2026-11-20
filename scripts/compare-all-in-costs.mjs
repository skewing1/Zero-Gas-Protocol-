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
  for(const r of p.receipts){const h=r.transactionHash?.toLowerCase();if(!/^0x[0-9a-f]{64}$/.test(h)||hashes.has(h)||r.status!=='success')throw Error('Invalid, duplicate or unsuccessful receipt');hashes.add(h);{const gas=integer(r.gasUsed,'gasUsed');if(gas===0n)throw Error('Receipt gasUsed must be positive');const blobGas=integer(r.blobGasUsed,'blobGasUsed');const blobPrice=integer(r.blobGasPriceWei,'blobGasPriceWei');const blobFee=integer(r.blobFeeWei,'blobFeeWei');if(blobGas*blobPrice!==blobFee)throw Error('Blob fee mismatch');receipts+=gas*integer(r.effectiveGasPriceWei,'effectiveGasPriceWei')+integer(r.l1DataFeeWei,'l1DataFeeWei')+blobFee}}
  // Payer-perspective accounting: relayer compensation is an explicit transfer paid by the user,
  // distinct from the relayer's operational expenses. Both must be priced; neither is inferred from gas.
  let extra=0n;const missing=[];for(const k of ['relayerCompensationWei','relayerOperatingCostWei','deploymentCostWei','settlementCostWei','otherCostWei']){if(p[k]===null)missing.push(p.id+'.'+k);else extra+=integer(p[k],k)}
  return {outcomes,receipts,total:receipts+extra,missing}
 };
 const a=check(paths[0]),b=check(paths[1]);if(a.outcomes.size!==b.outcomes.size||[...a.outcomes].some(([k,v])=>b.outcomes.get(k)!==v))throw Error('Recipient outcomes differ');
 const missingCosts=[...a.missing,...b.missing],costInputsComplete=missingCosts.length===0;
 // Supplied receipts and balances are assertions, not independently authenticated chain evidence.
 // Even complete cost inputs cannot establish measured savings without RPC receipt verification.
 const verifiedAllIn=false;
 const savingsBasisPoints=costInputsComplete&&a.total>0n?((a.total-b.total)*10000n/a.total).toString():null;
 return {equivalentOutcomes:true,baselineReceiptWei:a.receipts.toString(),candidateReceiptWei:b.receipts.toString(),baselineKnownCostWei:a.total.toString(),candidateKnownCostWei:b.total.toString(),missingCosts,costInputsComplete,verifiedAllIn,savingsBasisPoints,measuredSavingsBasisPoints:null,exceeds45Percent:null};
}
if(process.argv[1]?.endsWith('compare-all-in-costs.mjs')&&process.argv[2]){try{console.log(JSON.stringify(compareAllInCosts(JSON.parse(readFileSync(process.argv[2],'utf8'))),null,2))}catch(e){console.error(e.message);process.exitCode=1}}
