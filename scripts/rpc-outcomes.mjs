#!/usr/bin/env node
// Read-only block-hash-pinned native/ERC20 balance snapshots. No signing or broadcasts.
import assert from 'node:assert/strict';
const address=s=>{assert(/^0x[0-9a-fA-F]{40}$/.test(s??''),'Invalid address');return s.toLowerCase()};
const quantity=s=>{assert(/^0x(?:0|[1-9a-fA-F][0-9a-fA-F]*)$/.test(s??''),'Invalid RPC quantity');return BigInt(s)};
const hash=s=>{assert(/^0x[0-9a-fA-F]{64}$/.test(s??''),'Invalid block hash');return s.toLowerCase()};
export async function captureRecipientBalances({rpc,blockNumber,asset='native',recipients}){
 assert(typeof rpc==='function','RPC function required');
 assert(typeof blockNumber==='string'&&/^0x(?:0|[1-9a-fA-F][0-9a-fA-F]*)$/.test(blockNumber),'Explicit block number required');
 assert(Array.isArray(recipients)&&recipients.length>0,'Recipients required');
 const addresses=recipients.map(address);
 assert(new Set(addresses).size===addresses.length,'Duplicate recipient');
 const token=asset==='native'?'native':address(asset);
 const chainId=quantity(await rpc('eth_chainId',[]));
 assert(chainId>0n,'Invalid chain');
 const block=await rpc('eth_getBlockByNumber',[blockNumber,false]);
 assert(block&&quantity(block.number)===quantity(blockNumber),'Block number mismatch');
 const blockHash=hash(block.hash);
 const blockRef={blockHash,requireCanonical:true}; // EIP-1898; fail if provider does not support it
 const balances=[];
 for(const recipient of addresses){
  let result;
  if(token==='native')result=await rpc('eth_getBalance',[recipient,blockRef]);
  else {
   const data='0x70a08231'+recipient.slice(2).padStart(64,'0');
   result=await rpc('eth_call',[{to:token,data},blockRef]);
   assert(/^0x[0-9a-fA-F]{64}$/.test(result??''),'Invalid ERC20 balanceOf response');
   result='0x'+BigInt(result).toString(16);
  }
  balances.push({address:recipient,balance:quantity(result).toString()});
 }
 const canonical=await rpc('eth_getBlockByNumber',[blockNumber,false]);
 assert(canonical&&hash(canonical.hash)===blockHash,'Reorganization during snapshot');
 assert(quantity(await rpc('eth_chainId',[]))===chainId,'RPC chain changed');
 return {chainId:chainId.toString(),asset:token,blockNumber:quantity(blockNumber).toString(),blockHash,recipients:balances,verifiedByTool:false};
}
// Validate untrusted snapshots before deriving recipient deltas. A digest alone is not proof.
function validateSnapshot(s){
 assert(s&&typeof s==='object','Snapshot required');
 assert(typeof s.chainId==='string'&&/^[1-9][0-9]*$/.test(s.chainId),'Invalid snapshot chain');
 assert(s.asset==='native'||(typeof s.asset==='string'&&/^0x[0-9a-f]{40}$/.test(s.asset)),'Invalid snapshot asset');
 assert(typeof s.blockNumber==='string'&&/^(0|[1-9][0-9]*)$/.test(s.blockNumber),'Invalid snapshot height');
 assert(typeof s.blockHash==='string'&&/^0x[0-9a-f]{64}$/.test(s.blockHash),'Invalid snapshot block hash');
 assert(Array.isArray(s.recipients)&&s.recipients.length>0,'Invalid snapshot recipients');
 const seen=new Set();
 for(const r of s.recipients){
  assert(r&&typeof r.address==='string'&&/^0x[0-9a-f]{40}$/.test(r.address),'Invalid snapshot recipient address');
  assert(!seen.has(r.address),'Duplicate snapshot recipient');
  seen.add(r.address);
  assert(typeof r.balance==='string'&&/^(0|[1-9][0-9]*)$/.test(r.balance),'Invalid snapshot balance');
 }
}
export function pairSnapshots(before,after){
 validateSnapshot(before);validateSnapshot(after);
 assert(before.chainId===after.chainId&&before.asset===after.asset,'Chain/asset mismatch');
 assert(BigInt(before.blockNumber)<BigInt(after.blockNumber),'Non-increasing block heights');
 assert(before.blockHash!==after.blockHash,'Identical block hash at distinct heights');
 const earlier=new Map(before.recipients.map(x=>[x.address,x.balance]));
 assert(after.recipients.length===earlier.size,'Recipient count mismatch');
 const seen=new Set();
 const recipients=after.recipients.map(x=>{
  assert(earlier.has(x.address)&&!seen.has(x.address),'Missing/duplicate recipient');
  seen.add(x.address);
  return {address:x.address,before:earlier.get(x.address),after:x.balance};
 });
 return {chainId:before.chainId,asset:before.asset,recipients,
 provenance:{before:{blockNumber:before.blockNumber,blockHash:before.blockHash},after:{blockNumber:after.blockNumber,blockHash:after.blockHash}},
 verifiedByTool:false};
}
