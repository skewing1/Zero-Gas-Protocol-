import test from 'node:test';
import assert from 'node:assert/strict';
import {captureReceipt} from './capture-canonical-receipt.mjs';
const H='0x'+'ab'.repeat(32), B='0x'+'cd'.repeat(32);
function fixture(overrides={}){
 const receipt={transactionHash:H,status:'0x1',blockHash:B,blockNumber:'0xa',gasUsed:'0x5208',effectiveGasPrice:'0x2',type:'0x4',transactionIndex:'0x0',...overrides.receipt};
 const tx={hash:H,blockHash:B,blockNumber:'0xa',type:'0x4',chainId:'0x2105',transactionIndex:'0x0',...overrides.tx};
 const block={hash:B,number:'0xa',transactions:[{hash:H}],...overrides.block};
 let chainCalls=0,blockCalls=0,receiptCalls=0,txCalls=0,tipCalls=0;
 return async(method)=>{
  if(method==='eth_chainId'){chainCalls++;return chainCalls>1&&overrides.finalChain!==undefined?overrides.finalChain:'0x2105';}
  if(method==='eth_getTransactionReceipt'){receiptCalls++;return receiptCalls>1&&Object.hasOwn(overrides,'finalReceipt')?overrides.finalReceipt:(overrides.noReceipt?null:receipt);}
  if(method==='eth_getTransactionByHash'){txCalls++;return txCalls>1&&Object.hasOwn(overrides,'finalTx')?overrides.finalTx:tx;}
  if(method==='eth_getBlockByNumber'){blockCalls++;return blockCalls>1&&overrides.finalBlock?overrides.finalBlock:block;}
  if(method==='eth_blockNumber'){tipCalls++;return tipCalls>1&&overrides.finalTip!==undefined?overrides.finalTip:(overrides.tip??'0xb');}
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

test('rejects receipt and transaction index mismatch',async()=>await assert.rejects(
 captureReceipt(fixture({tx:{transactionIndex:'0x1'}}),H),/index mismatch/));
test('rejects receipt index absent from canonical block',async()=>await assert.rejects(
 captureReceipt(fixture({block:{transactions:[]}}),H),/missing block transaction/));
test('rejects unrelated transaction at claimed canonical index',async()=>await assert.rejects(
 captureReceipt(fixture({block:{transactions:[{hash:'0x'+'ee'.repeat(32)}]}}),H),/index\/hash mismatch/));
test('rejects index membership change during confirmation',async()=>await assert.rejects(
 captureReceipt(fixture({finalBlock:{hash:B,number:'0xa',transactions:[{hash:'0x'+'ee'.repeat(32)}]}}),H),/inclusion changed/));
test('includes canonical transaction index in read-only evidence',async()=>{
 const result=await captureReceipt(fixture(),H,{requireType4:true});
 assert.equal(result.transactionIndex,'0');
});

test('accepts standard hash-only canonical block response',async()=>{
 const result=await captureReceipt(fixture({finalBlock:{hash:B,number:'0xa',transactions:[H]}}),H,{requireType4:true});
 assert.equal(result.transactionIndex,'0');
});
test('rejects wrong hash in hash-only canonical block response',async()=>await assert.rejects(
 captureReceipt(fixture({finalBlock:{hash:B,number:'0xa',transactions:['0x'+'ee'.repeat(32)]}}),H),
 /inclusion changed/));

test('rejects final canonical block number mismatch despite matching block hash',async()=>await assert.rejects(
 captureReceipt(fixture({finalBlock:{hash:B,number:'0xb',transactions:[H]}}),H,{requireType4:true}),
 /block changed/));
test('rejects final canonical block missing number despite matching hash',async()=>await assert.rejects(
 captureReceipt(fixture({finalBlock:{hash:B,transactions:[H]}}),H,{requireType4:true}),
 /finalBlock.number/));
test('accepts matching final block number with hash-only transactions',async()=>{
 const result=await captureReceipt(fixture({finalBlock:{hash:B,number:'0xa',transactions:[H]}}),H,{requireType4:true});
 assert.equal(result.blockNumber,'10');
});

test('rejects receipt disappearance after canonical confirmation',async()=>await assert.rejects(
 captureReceipt(fixture({finalReceipt:null}),H,{requireType4:true}),/receipt disappeared/));
test('rejects receipt fee mutation after canonical confirmation',async()=>await assert.rejects(
 captureReceipt(fixture({finalReceipt:{transactionHash:H,status:'0x1',blockHash:B,blockNumber:'0xa',gasUsed:'0x5208',effectiveGasPrice:'0x3',type:'0x4',transactionIndex:'0x0'}}),H,{requireType4:true}),/receipt changed/));
test('rejects receipt index mutation after canonical confirmation',async()=>await assert.rejects(
 captureReceipt(fixture({finalReceipt:{transactionHash:H,status:'0x1',blockHash:B,blockNumber:'0xa',gasUsed:'0x5208',effectiveGasPrice:'0x2',type:'0x4',transactionIndex:'0x1'}}),H,{requireType4:true}),/receipt changed/));

test('rejects transaction disappearance after canonical receipt check',async()=>await assert.rejects(
 captureReceipt(fixture({finalTx:null}),H,{requireType4:true}),/transaction disappeared/));
test('rejects transaction type mutation after canonical receipt check',async()=>await assert.rejects(
 captureReceipt(fixture({finalTx:{hash:H,blockHash:B,blockNumber:'0xa',type:'0x2',chainId:'0x2105',transactionIndex:'0x0'}}),H,{requireType4:true}),/transaction changed/));
test('rejects transaction index mutation after canonical receipt check',async()=>await assert.rejects(
 captureReceipt(fixture({finalTx:{hash:H,blockHash:B,blockNumber:'0xa',type:'0x4',chainId:'0x2105',transactionIndex:'0x1'}}),H,{requireType4:true}),/transaction changed/));
test('rejects confirmation depth loss during final verification',async()=>await assert.rejects(
 captureReceipt(fixture({finalTip:'0xa'}),H,{confirmations:2}),/confirmations lost/));

// Final confirmation count must describe the last observed tip, not a stale earlier tip.
test('reports final confirmation depth when tip advances',async()=>{
 const result=await captureReceipt(fixture({tip:'0xb',finalTip:'0xd'}),H,{confirmations:2});
 assert.equal(result.confirmationsObserved,'4');
});
test('reports final confirmation depth when tip retreats but remains sufficient',async()=>{
 const result=await captureReceipt(fixture({tip:'0xd',finalTip:'0xb'}),H,{confirmations:2});
 assert.equal(result.confirmationsObserved,'2');
});
