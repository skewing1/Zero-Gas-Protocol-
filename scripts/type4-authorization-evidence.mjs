import assert from 'node:assert/strict';
const quantity=(value,label)=>{assert(typeof value==='string' && /^0x(?:0|[1-9a-fA-F][0-9a-fA-F]*)$/.test(value),label+' must be canonical RPC quantity');return BigInt(value)};
const address=(value,label)=>assert(typeof value==='string' && /^0x[0-9a-fA-F]{40}$/.test(value),label+' must be an address');
const SECP256K1_ORDER=0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141n;
const signature=(value,label)=>{
 assert(typeof value==='string' && /^0x[0-9a-fA-F]{64}$/.test(value),label+' must be 32-byte hex');
 const scalar=BigInt(value);
 assert(scalar>0n && scalar<SECP256K1_ORDER,label+' outside secp256k1 scalar range');
 return scalar;
};
/** Structural RPC evidence only; does not verify ECDSA signatures. */
export function inspectType4Transaction(tx,expectedChainId){
 assert(tx && typeof tx==='object','Transaction missing');
 assert(quantity(tx.type,'transaction type')===4n,'Not an EIP-7702 type-4 transaction');
 const chain=quantity(expectedChainId,'expected chainId');
 assert(quantity(tx.chainId,'transaction chainId')===chain,'Transaction chain mismatch');
 assert(Array.isArray(tx.authorizationList)&&tx.authorizationList.length>0,'Type-4 authorization list missing');
 const authorizations=tx.authorizationList.map((entry,index)=>{
  const label='authorization '+index;
  assert(entry&&typeof entry==='object',label+' missing');
  const authChain=quantity(entry.chainId,label+' chainId');
  assert(authChain===0n||authChain===chain,label+' chain mismatch');
  address(entry.address,label+' delegate');
  quantity(entry.nonce,label+' nonce');
  const y=quantity(entry.yParity,label+' yParity');
  assert(y===0n||y===1n,label+' invalid yParity');
  signature(entry.r,label+' r');signature(entry.s,label+' s');
  return {chainId:authChain.toString(),delegate:entry.address.toLowerCase(),nonce:BigInt(entry.nonce).toString()};
 });
 return {transactionType:'4',authorizationCount:authorizations.length,authorizations,signatureVerified:false,executionVerified:false};
}
/** Read-only preflight; pair with canonical receipt costs and independent balance deltas. */
export async function inspectMinedType4({rpc,transactionHash,minConfirmations=1}){
 assert(Number.isSafeInteger(minConfirmations)&&minConfirmations>=1&&minConfirmations<=2048,'Invalid minimum confirmations');
 assert(typeof rpc==='function','RPC function required');
 assert(typeof transactionHash==='string'&&/^0x[0-9a-fA-F]{64}$/.test(transactionHash),'Invalid transaction hash');
 const [chainId,tx,receipt]=await Promise.all([rpc('eth_chainId',[]),rpc('eth_getTransactionByHash',[transactionHash]),rpc('eth_getTransactionReceipt',[transactionHash])]);
 assert(tx&&receipt,'Transaction must be mined');
 assert(tx.hash?.toLowerCase()===transactionHash.toLowerCase(),'Transaction hash mismatch');
 assert(receipt.transactionHash?.toLowerCase()===transactionHash.toLowerCase(),'Receipt hash mismatch');
 assert(quantity(receipt.type,'receipt type')===4n,'Receipt is not type-4');
 assert(quantity(receipt.status,'receipt status')===1n,'Type-4 transaction reverted');
 assert(tx.blockHash&&receipt.blockHash&&tx.blockHash.toLowerCase()===receipt.blockHash.toLowerCase(),'Mined block mismatch');
 assert(typeof tx.blockHash==='string'&&/^0x[0-9a-fA-F]{64}$/.test(tx.blockHash),'Invalid mined block hash');
 assert(quantity(tx.blockNumber,'transaction blockNumber')===quantity(receipt.blockNumber,'receipt blockNumber'),'Mined block height mismatch');
 assert(quantity(tx.transactionIndex,'transaction index')===quantity(receipt.transactionIndex,'receipt transactionIndex'),'Mined transaction position mismatch');
 const block=await rpc('eth_getBlockByHash',[receipt.blockHash,false]);
 assert(block&&typeof block==='object','Mined block missing');
 assert(typeof block.hash==='string'&&block.hash.toLowerCase()===receipt.blockHash.toLowerCase(),'Canonical block hash mismatch');
 assert(quantity(block.number,'block number')===quantity(receipt.blockNumber,'receipt blockNumber'),'Canonical block height mismatch');
 assert(Array.isArray(block.transactions),'Canonical block transactions missing');
 const index=quantity(receipt.transactionIndex,'receipt transactionIndex');
 assert(index<BigInt(block.transactions.length),'Transaction index outside block');
 assert(typeof block.transactions[Number(index)]==='string'&&block.transactions[Number(index)].toLowerCase()===transactionHash.toLowerCase(),'Transaction absent at mined block index');
 // A block returned by hash need not belong to the current canonical chain.
 // Check the canonical height mapping and tip, then recheck after inspection.
 const height=quantity(receipt.blockNumber,'receipt blockNumber');
 const [canonical,head]=await Promise.all([
  rpc('eth_getBlockByNumber',[receipt.blockNumber,false]),
  rpc('eth_getBlockByNumber',['latest',false])
 ]);
 assert(canonical&&typeof canonical.hash==='string'&&canonical.hash.toLowerCase()===receipt.blockHash.toLowerCase(),'Receipt block is not canonical at its height');
 assert(head&&typeof head.hash==='string'&&/^0x[0-9a-fA-F]{64}$/.test(head.hash),'Canonical head missing');
 const tip=quantity(head.number,'head number');
 assert(tip>=height && tip-height+1n>=BigInt(minConfirmations),'Insufficient confirmations');
 const evidence=inspectType4Transaction(tx,chainId);
 const [again,headAgain]=await Promise.all([
  rpc('eth_getBlockByNumber',[receipt.blockNumber,false]),
  rpc('eth_getBlockByNumber',['latest',false])
 ]);
 assert(again&&typeof again.hash==='string'&&again.hash.toLowerCase()===receipt.blockHash.toLowerCase(),'Receipt block changed during inspection');
 assert(headAgain&&typeof headAgain.hash==='string'&&/^0x[0-9a-fA-F]{64}$/.test(headAgain.hash),'Canonical head missing on recheck');
 const tipAgain=quantity(headAgain.number,'rechecked head number');
 assert(tipAgain>=tip,'Chain head height regressed during inspection');
 if(tipAgain===tip) assert(headAgain.hash.toLowerCase()===head.hash.toLowerCase(),'Chain head changed during inspection');
 // A higher tip can hide a reorg of the original head; compare its canonical height.
 // A head reorg above the receipt height must not be mistaken for ordinary extension.
 if(tipAgain>tip){
  const previousHead=await rpc('eth_getBlockByNumber',[head.number,false]);
  assert(previousHead&&typeof previousHead.hash==='string'&&previousHead.hash.toLowerCase()===head.hash.toLowerCase(),'Previous chain head was replaced during extension');
 }
 assert(tipAgain>=height && tipAgain-height+1n>=BigInt(minConfirmations),'Confirmations lost during inspection');
 return {...evidence,transactionHash:transactionHash.toLowerCase(),blockHash:receipt.blockHash.toLowerCase(),claimableSavings:false};
}
