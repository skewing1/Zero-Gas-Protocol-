import test from 'node:test';
import assert from 'node:assert/strict';
import { audit7702 } from './audit-7702-receipt.mjs';
const hash='0x'+'ab'.repeat(32), blockHash='0x'+'cd'.repeat(32);
const tx={hash,type:'0x4',chainId:'0x7a69',authorizationList:[{address:'0x'+'11'.repeat(20),chainId:'0x7a69',nonce:'0x0',yParity:'0x1',r:'0x1',s:'0x2'}]};
const receipt={transactionHash:hash,type:'0x4',status:'0x1',blockNumber:'0x1',blockHash,gasUsed:'0x5208',effectiveGasPrice:'0x3'};
const block={hash:blockHash,transactions:[hash]};
const rpc=async(method)=>({'eth_getTransactionByHash':tx,'eth_getTransactionReceipt':receipt,'eth_getBlockByNumber':block})[method];
test('mined type-4 receipt and fee evidence',async()=>{
  const r=await audit7702(rpc,hash);
  assert.equal(r.executionWei,'63000');
  assert.equal(r.l1FeeWei,null);
  assert.equal(r.verifiedSavings,false);
});
test('reject absent authorization',async()=>{
  await assert.rejects(audit7702(async(m)=>m==='eth_getTransactionByHash'?{...tx,authorizationList:[]}:rpc(m),hash),/authorization list/);
});
test('reject orphaned receipt',async()=>{
  await assert.rejects(audit7702(async(m)=>m==='eth_getBlockByNumber'?{...block,transactions:[]}:rpc(m),hash),/absent/);
});
test('reject missing positive blob price',async()=>{
  await assert.rejects(audit7702(async(m)=>m==='eth_getTransactionReceipt'?{...receipt,blobGasUsed:'0x1'}:rpc(m),hash),/Blob fee missing/);
});
