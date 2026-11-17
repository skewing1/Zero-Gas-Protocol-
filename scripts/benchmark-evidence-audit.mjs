// Read-only audit of bench/results.json. Not a proof of network fees or payment attribution.
const DEC=/^(0|[1-9][0-9]*)$/;
const HASH=/^0x[0-9a-fA-F]{64}$/;
function nat(x,name){if(typeof x!=='string'||!DEC.test(x))throw Error(name+': canonical wei integer required');return BigInt(x)}
function receipts(p,label){
 if(!Array.isArray(p.receipts)||!p.receipts.length)throw Error(label+': receipts missing');
 const seen=new Set();let gas=0n,fee=0n;
 for(const r of p.receipts){
  if(!r||!HASH.test(r.hash))throw Error(label+': invalid receipt hash');
  const hash=r.hash.toLowerCase();if(seen.has(hash))throw Error(label+': duplicate receipt');seen.add(hash);
  if(r.stage==='prefund')throw Error(label+': prefunding excluded from reported totals');
  if(r.stage==='deployment')continue;
  if(!Number.isSafeInteger(r.gasUsed)||r.gasUsed<0)throw Error(label+': invalid gasUsed');
  const used=BigInt(r.gasUsed),price=nat(r.effectiveGasPrice,'effectiveGasPrice');
  const l1=r.l1Fee===undefined?0n:nat(r.l1Fee,'l1Fee');
  if(nat(r.feeWei,'feeWei')!==used*price+l1)throw Error(label+': receipt fee mismatch');
  gas+=used;fee+=used*price+l1;
 }
 if(gas!==BigInt(p.gas)||fee!==nat(p.feeWei,'total feeWei'))throw Error(label+': aggregate mismatch');
 return fee;
}
export function auditBenchmarkGroups(groups){
 if(!Array.isArray(groups)||!groups.length)throw Error('nonempty benchmark groups required');
 const seenGroups=new Set();
 return groups.map(g=>{
  const key=g.workload+'/'+g.asset;if(seenGroups.has(key))throw Error('duplicate workload/asset group');seenGroups.add(key);
  if(!Array.isArray(g.paths)||!g.paths.length||g.paths[0].path!=='P0')throw Error(key+': P0 baseline required');
  const seenPaths=new Set();
  const paths=g.paths.map(p=>{
   if(seenPaths.has(p.path))throw Error(key+': duplicate path');seenPaths.add(p.path);
   const fee=receipts(p,key+'/'+p.path);
   if(!Array.isArray(p.finalBalances)||!p.finalBalances.length||p.finalBalances.some(v=>typeof v!=='string'||!DEC.test(v)))throw Error(key+': balances missing');
   return {path:p.path,fee,balances:p.finalBalances};
  });
  const baseline=paths[0];if(baseline.fee===0n)throw Error(key+': zero baseline');
  for(const p of paths)if(JSON.stringify(p.balances)!==JSON.stringify(baseline.balances))throw Error(key+': unequal final balances');
  return {workload:g.workload,asset:g.asset,comparisons:paths.map(p=>({path:p.path,executionFeeWei:p.fee.toString(),executionOnlySavingsBps:((baseline.fee-p.fee)*10000n/baseline.fee).toString(),verifiedAllInSavings:false})),evidenceLevel:'LOCAL_RECEIPTS_UNATTESTED_AND_OPERATING_COSTS_EXCLUDED'};
 });
}
