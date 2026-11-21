import test from 'node:test';
import assert from 'node:assert/strict';
import {captureReceipt} from './capture-canonical-receipt.mjs';
const H='0x'+'ab'.repeat(32), B='0x'+'cd'.repeat(32);
function fixture(overrides={}){
 const receipt={transactionHash:H,status:'0x1',blockHash:B,blockNumber:'0xa',gasUsed:'0x5208',effectiveGasPrice:'0x2',type:'0x4',...overrides.receipt};
 const tx={hash:H,blockHash:B,blockNumber:'0xa',type:'0x4',chainId:'0x2105',...overrides.tx};
 const block={hash:B,number:'0xa',...overrides.block};
 let chainCalls=0,blockCalls=0;
 return async(method)=>{
  if(method==='eth_chainId'){chainCalls++;return chainCalls>1&&overrides.finalChain!==undefined?overrides.finalChain:'0x2105';}
  if(method==='eth_getTransactionReceipt')return overrides.noReceipt?null:receipt;
  if(method==='eth_getTransactionByHash')return tx;
  if(method==='eth_getBlockByNumber'){blockCalls++;return blockCalls>1&&overrides.finalBlock?overrides.finalBlock:block;}
  if(method==='eth_blockNumber')return overrides.tip??'0xb';
  throw Error('unexpected method '+method);
 };
}
test('captures genuine-shaped type-4 receipt as observation only',async()=>{
 const r=await captureReceipt(fixture(),H,{expectedChainId:8453,requireType4:true});
 assert.equal(r.receiptExecutionWei,(21000n*2n).toString());
 assert.equal(r.confirmationsObserved,'2');
 assert.match(r.kind,/NOT_OUTCOME_PROOF/);
});
test('rejects non-type-4 transaction',async()=>await assert.rejects(captureReceipt(fixture({tx:{type:'0x2'},receipt:{type:'0x2'}}),H,{requireType4:true}),/type-4/));
test('rejects insufficient confirmations',async()=>await assert.rejects(captureReceipt(fixture({tip:'0xa'}),H),/confirmations/));
test('rejects reorg during observation',async()=>await assert.rejects(captureReceipt(fixture({finalBlock:{hash:'0x'+'ee'.repeat(32)}}),H),/block changed/));
test('rejects chain switch',async()=>await assert.rejects(captureReceipt(fixture({finalChain:'0x1'}),H),/chain changed/));
test('rejects transaction and receipt block mismatch',async()=>await assert.rejects(captureReceipt(fixture({tx:{blockHash:'0x'+'ee'.repeat(32)}}),H),/inclusion mismatch/));
test('rejects failed receipt',async()=>await assert.rejects(captureReceipt(fixture({receipt:{status:'0x0'}}),H),/not successful/));
test('rejects missing receipt',async()=>await assert.rejects(captureReceipt(fixture({noReceipt:true}),H),/missing receipt/));
test('rejects mismatched chain',async()=>await assert.rejects(captureReceipt(fixture(),H,{expectedChainId:1}),/unexpected chainId/));
test('rejects noncanonical block',async()=>await assert.rejects(captureReceipt(fixture({block:{hash:'0x'+'ee'.repeat(32)}}),H),/noncanonical/));
