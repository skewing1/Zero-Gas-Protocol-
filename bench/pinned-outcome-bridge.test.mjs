import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyPinnedPaymentOutcomes } from './pinned-outcome-bridge.mjs';

const A='0x'+'12'.repeat(20), T='0x'+'34'.repeat(20);
const H1='0x'+'ab'.repeat(32), H2='0x'+'cd'.repeat(32);
const before={number:'10',hash:H1}, after={number:'11',hash:H2};
const path={chainId:'8453',outcome:[{recipient:A,asset:'native',deltaWei:'5'},{recipient:A,asset:T,deltaWei:'7'}]};
function mock({badDelta=false,reorg=false,wrongChain=false}={}){
 const calls=[];
 const rpc=async(method,params)=>{
  calls.push([method,params]);
  if(method==='eth_chainId')return wrongChain?'0x1':'0x2105';
  if(method==='eth_getBlockByNumber'){
   const n=BigInt(params[0]);
   return {number:params[0],hash:n===10n?H1:(reorg?'0x'+'ee'.repeat(32):H2)};
  }
  const h=method==='eth_getBalance'?params[1].blockHash:params[1].blockHash;
  const isAfter=h===H2;
  if(method==='eth_getBalance')return isAfter?(badDelta?'0x68':'0x69'):'0x64';
  if(method==='eth_call')return '0x'+(isAfter?27n:20n).toString(16).padStart(64,'0');
  throw Error(method);
 };
 return {rpc,calls};
}
test('collects before and after at pinned hashes and verifies both assets',async()=>{
 const {rpc,calls}=mock();
 const result=await verifyPinnedPaymentOutcomes(rpc,path,before,after);
 assert.equal(result.checkedRecipients,2);
 assert.equal(result.finalityVerified,false);
 assert.equal(result.transactionCausalityVerified,false);
 assert.equal(result.before.blockHash,H1);
 assert.equal(result.after.blockHash,H2);
 assert.equal(calls.filter(x=>x[0]==='eth_getBalance').length,2);
 assert.equal(calls.filter(x=>x[0]==='eth_call').length,2);
});
test('rejects mismatched actual balance delta',async()=>{
 await assert.rejects(verifyPinnedPaymentOutcomes(mock({badDelta:true}).rpc,path,before,after),/delta/);
});
test('rejects RPC chain mismatch',async()=>{
 await assert.rejects(verifyPinnedPaymentOutcomes(mock({wrongChain:true}).rpc,path,before,after),/chain mismatch/);
});
test('rejects block hash changes',async()=>{
 await assert.rejects(verifyPinnedPaymentOutcomes(mock({reorg:true}).rpc,path,before,after),/Block identity mismatch/);
});
test('rejects missing declared coverage before RPC',async()=>{
 const {rpc,calls}=mock();
 await assert.rejects(verifyPinnedPaymentOutcomes(rpc,{chainId:'8453',outcome:[]},before,after),/Missing declared/);
 assert.equal(calls.length,0);
});
test('rejects duplicate declared recipient/asset',async()=>{
 const {rpc}=mock();
 await assert.rejects(verifyPinnedPaymentOutcomes(rpc,{...path,outcome:[path.outcome[0],path.outcome[0]]},before,after),/Duplicate/);
});
