import assert from 'node:assert/strict';
const quantity=(value,label)=>{assert(typeof value==='string' && /^0x(?:0|[1-9a-fA-F][0-9a-fA-F]*)$/.test(value),label+' must be canonical RPC quantity');return BigInt(value)};
const address=(value,label)=>assert(typeof value==='string' && /^0x[0-9a-fA-F]{40}$/.test(value),label+' must be an address');
const signature=(value,label)=>assert(typeof value==='string' && /^0x[0-9a-fA-F]{64}$/.test(value),label+' must be 32-byte hex');
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
  assert(BigInt(entry.r)>0n&&BigInt(entry.s)>0n,label+' zero signature scalar');
  return {chainId:authChain.toString(),delegate:entry.address.toLowerCase(),nonce:BigInt(entry.nonce).toString()};
 });
 return {transactionType:'4',authorizationCount:authorizations.length,authorizations,signatureVerified:false,executionVerified:false};
}
/** Read-only preflight; pair with canonical receipt costs and independent balance deltas. */
export async function inspectMinedType4({rpc,transactionHash}){
 assert(typeof rpc==='function','RPC function required');
 assert(typeof transactionHash==='string'&&/^0x[0-9a-fA-F]{64}$/.test(transactionHash),'Invalid transaction hash');
 const [chainId,tx,receipt]=await Promise.all([rpc('eth_chainId',[]),rpc('eth_getTransactionByHash',[transactionHash]),rpc('eth_getTransactionReceipt',[transactionHash])]);
 assert(tx&&receipt,'Transaction must be mined');
 assert(tx.hash?.toLowerCase()===transactionHash.toLowerCase(),'Transaction hash mismatch');
 assert(receipt.transactionHash?.toLowerCase()===transactionHash.toLowerCase(),'Receipt hash mismatch');
 assert(quantity(receipt.type,'receipt type')===4n,'Receipt is not type-4');
 assert(quantity(receipt.status,'receipt status')===1n,'Type-4 transaction reverted');
 assert(tx.blockHash&&receipt.blockHash&&tx.blockHash.toLowerCase()===receipt.blockHash.toLowerCase(),'Mined block mismatch');
 const evidence=inspectType4Transaction(tx,chainId);
 return {...evidence,transactionHash:transactionHash.toLowerCase(),blockHash:receipt.blockHash.toLowerCase(),claimableSavings:false};
}
