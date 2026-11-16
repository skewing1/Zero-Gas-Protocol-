// Read-only RPC receipt attestation. RPC observation is not finality or recipient-balance proof.
const hex=(v,n,label)=>{if(typeof v!=='string'||!new RegExp('^0x[0-9a-fA-F]{'+n+'}$').test(v))throw Error(label+': invalid hex');return v.toLowerCase()};
const q=(v,label)=>{if(typeof v!=='string'||!/^0x(?:0|[1-9a-fA-F][0-9a-fA-F]*)$/.test(v))throw Error(label+': invalid RPC quantity');return BigInt(v)};
const dec=(v,label)=>{if(typeof v!=='string'||!/^(0|[1-9][0-9]*)$/.test(v))throw Error(label+': decimal integer required');return BigInt(v)};
export async function attestReceipts({chainId,receipts,minConfirmations=12,rpc}){
 if(typeof rpc!=='function')throw Error('RPC transport required');
 const expected=dec(chainId,'chainId');if(expected===0n)throw Error('zero chainId');
 if(!Number.isSafeInteger(minConfirmations)||minConfirmations<1)throw Error('invalid confirmation threshold');
 if(!Array.isArray(receipts)||!receipts.length)throw Error('nonempty receipts required');
 if(q(await rpc('eth_chainId',[]),'RPC chainId')!==expected)throw Error('RPC chain mismatch');
 const head=q(await rpc('eth_blockNumber',[]),'head');const seen=new Set(),evidence=[];
 for(const supplied of receipts){
  const hash=hex(supplied.transactionHash,64,'transactionHash');
  if(seen.has(hash))throw Error('duplicate transaction hash');seen.add(hash);
  const mined=await rpc('eth_getTransactionReceipt',[hash]);
  if(!mined)throw Error('missing mined receipt');
  if(hex(mined.transactionHash,64,'mined hash')!==hash)throw Error('receipt hash mismatch');
  if(q(mined.status,'status')!==1n)throw Error('failed transaction');
  const height=q(mined.blockNumber,'blockNumber');
  if(height>head||head-height+1n<BigInt(minConfirmations))throw Error('insufficient confirmations');
  const blockHash=hex(mined.blockHash,64,'blockHash');
  const block=await rpc('eth_getBlockByNumber',[mined.blockNumber,false]);
  if(!block||hex(block.hash,64,'canonical hash')!==blockHash||q(block.number,'block number')!==height)throw Error('noncanonical receipt block');
  const tx=await rpc('eth_getTransactionByHash',[hash]);
  if(!tx||hex(tx.hash,64,'transaction hash')!==hash||hex(tx.blockHash,64,'transaction block hash')!==blockHash)throw Error('transaction inclusion mismatch');
  if(supplied.from!=null&&hex(supplied.from,40,'sender')!==hex(tx.from,40,'sender'))throw Error('sender mismatch');
  if(supplied.to!=null&&hex(supplied.to,40,'destination')!==hex(tx.to,40,'destination'))throw Error('destination mismatch');
  const gas=q(mined.gasUsed,'gasUsed'),price=q(mined.effectiveGasPrice,'effectiveGasPrice');
  const l1=mined.l1Fee==null?0n:q(mined.l1Fee,'l1Fee');
  if((mined.blobGasUsed==null)!==(mined.blobGasPrice==null))throw Error('incomplete blob fee fields');
  const blob=mined.blobGasUsed==null?0n:q(mined.blobGasUsed,'blobGasUsed')*q(mined.blobGasPrice,'blobGasPrice');
  const fee=gas*price+l1+blob;
  if(dec(supplied.totalFeeWei,'supplied totalFeeWei')!==fee)throw Error('supplied fee mismatch');
  if(supplied.blockHash!=null&&hex(supplied.blockHash,64,'supplied blockHash')!==blockHash)throw Error('supplied block mismatch');
  evidence.push({transactionHash:hash,blockHash,blockNumber:height.toString(),gasUsed:gas.toString(),executionFeeWei:(gas*price).toString(),l1FeeWei:l1.toString(),blobFeeWei:blob.toString(),totalFeeWei:fee.toString(),confirmations:(head-height+1n).toString()});
 }
 return {evidenceType:'rpc-observed-not-finalized',chainId:expected.toString(),observedHead:head.toString(),verifiedReceiptFields:true,verifiedRecipientOutcomes:false,verifiedEconomicSavings:false,receipts:evidence};
}
