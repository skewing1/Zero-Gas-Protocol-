// Fail-closed receipt evidence verifier. Validates supplied evidence, not RPC authenticity.
const integer=(v,name)=>{if(typeof v!=='string'||!/^(0|[1-9][0-9]*)$/.test(v))throw Error(name+': decimal integer string required');return BigInt(v)};
const hex=(v,n,name)=>{if(typeof v!=='string'||!new RegExp('^0x[0-9a-fA-F]{'+n+'}$').test(v))throw Error(name+': invalid hex');return v.toLowerCase()};
export function verifyEvidence(report){
 if(!report||!Array.isArray(report.paths)||report.paths.length!==2)throw Error('exactly two paths required');
 const chainId=integer(report.chainId,'chainId');if(chainId===0n)throw Error('chainId must be positive');
 const seen=new Set();
 const paths=report.paths.map(path=>{
  if(!path||!Array.isArray(path.receipts)||!path.receipts.length)throw Error('nonempty receipts required');
  const outcome=hex(path.outcomeDigest,64,'outcomeDigest');let receiptWei=0n;
  for(const receipt of path.receipts){
   if(receipt.status!=='0x1')throw Error('mined successful status required');
   if(integer(receipt.chainId,'receipt chainId')!==chainId)throw Error('receipt chain mismatch');
   const hash=hex(receipt.transactionHash,64,'transactionHash');
   if(seen.has(chainId+':'+hash))throw Error('duplicate transaction hash');seen.add(chainId+':'+hash);
   const gas=integer(receipt.gasUsed,'gasUsed'),price=integer(receipt.effectiveGasPrice,'effectiveGasPrice');
   const l1=integer(receipt.l1FeeWei,'l1FeeWei'),blob=integer(receipt.blobFeeWei,'blobFeeWei');
   const calculated=gas*price+l1+blob;
   if(integer(receipt.totalFeeWei,'totalFeeWei')!==calculated)throw Error('receipt fee mismatch');
   receiptWei+=calculated;
  }
  const costs=path.offchain;if(!costs)throw Error('offchain cost evidence required');
  let offchainWei=0n;
  for(const key of ['relayerWei','dataWei','proofWei','bridgeWei','infrastructureWei'])offchainWei+=integer(costs[key],key);
  return {outcome,receiptWei,offchainWei,totalWei:receiptWei+offchainWei};
 });
 if(paths[0].outcome!==paths[1].outcome)throw Error('recipient outcome mismatch');
 if(paths[0].totalWei===0n)throw Error('zero baseline');
 const savingsBps=(paths[0].totalWei-paths[1].totalWei)*10000n/paths[0].totalWei;
 return {evidenceType:'supplied-untrusted-receipts',chainId:chainId.toString(),baselineWei:paths[0].totalWei.toString(),candidateWei:paths[1].totalWei.toString(),savingsBps:savingsBps.toString(),exceeds45PercentScenario:savingsBps>4500n,verifiedOnchain:false};
}
