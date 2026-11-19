import test from 'node:test';
import assert from 'node:assert/strict';
import { audit7702 } from './audit-7702-receipt.mjs';
const hash='0x'+'ab'.repeat(32), blockHash='0x'+'cd'.repeat(32);
const tx={hash,type:'0x4',chainId:'0x7a69',authorizationList:[{address:'0x'+'11'.repeat(20),chainId:'0x7a69',nonce:'0x0',yParity:'0x1',r:'0x1',s:'0x2'}]};
const receipt={transactionHash:hash,type:'0x4',status:'0x1',blockNumber:'0x1',blockHash,transactionIndex:'0x0',gasUsed:'0x5208',effectiveGasPrice:'0x3'};
const block={hash:blockHash,transactions:[hash]};
const rpc=async(method)=>({'eth_chainId':'0x7a69','eth_getTransactionByHash':tx,'eth_getTransactionReceipt':receipt,'eth_getBlockByNumber':block})[method];
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

test('reject transaction and receipt block mismatch',async()=>{
  await assert.rejects(audit7702(async(m)=>m==='eth_getTransactionByHash'?{...tx,blockHash:'0x'+'ff'.repeat(32)}:rpc(m),hash),/block hash mismatch/);
});
test('reject inconsistent canonical block height',async()=>{
  await assert.rejects(audit7702(async(m)=>m==='eth_getBlockByNumber'?{...block,number:'0x2'}:rpc(m),hash),/not canonical/);
});
test('reject negative L1 fee instead of crediting cost',async()=>{
  await assert.rejects(audit7702(async(m)=>m==='eth_getTransactionReceipt'?{...receipt,l1Fee:'-0x1'}:rpc(m),hash),/Cannot convert|Negative L1 data fee/);
});
test('reject negative blob price even on non-blob transaction',async()=>{
  await assert.rejects(audit7702(async(m)=>m==='eth_getTransactionReceipt'?{...receipt,blobGasPrice:'-1'}:rpc(m),hash),/Negative blob price/);
});

test('reject authorization r equal to curve order',async()=>{
  const n='0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141';
  await assert.rejects(audit7702(async(m)=>m==='eth_getTransactionByHash'?{...tx,authorizationList:[{...tx.authorizationList[0],r:n}]}:rpc(m),hash),/r outside/);
});
test('reject high-s authorization signatures',async()=>{
  const n='0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364140';
  await assert.rejects(audit7702(async(m)=>m==='eth_getTransactionByHash'?{...tx,authorizationList:[{...tx.authorizationList[0],s:n}]}:rpc(m),hash),/low-s/);
});
test('reject negative authorization nonce',async()=>{
  await assert.rejects(audit7702(async(m)=>m==='eth_getTransactionByHash'?{...tx,authorizationList:[{...tx.authorizationList[0],nonce:'-1'}]}:rpc(m),hash),/Negative authorization nonce/);
});

test('reject transaction chain different from RPC network',async()=>{
  await assert.rejects(audit7702(async(m)=>m==='eth_chainId'?'0x1':rpc(m),hash),/Transaction chain differs/);
});
test('reject absent RPC chain identity',async()=>{
  await assert.rejects(audit7702(async(m)=>m==='eth_chainId'?null:rpc(m),hash),/Missing RPC chain identity/);
});
test('reject zero RPC chain identity',async()=>{
  await assert.rejects(audit7702(async(m)=>m==='eth_chainId'?'0x0':rpc(m),hash),/Invalid RPC chain identity/);
});
test('accept wildcard authorization chain only on verified transaction chain',async()=>{
  const wildcard={...tx,authorizationList:[{...tx.authorizationList[0],chainId:'0x0'}]};
  const result=await audit7702(async(m)=>m==='eth_getTransactionByHash'?wildcard:rpc(m),hash);
  assert.equal(result.chainId,'31337');
});

test('reject receipt pointing at a different canonical transaction position',async()=>{
  const other='0x'+'ef'.repeat(32);
  await assert.rejects(audit7702(async(m)=>
    m==='eth_getBlockByNumber'?{...block,transactions:[other,hash]}:rpc(m),hash),
    /index does not match/);
});
test('reject receipt index outside canonical block',async()=>{
  await assert.rejects(audit7702(async(m)=>
    m==='eth_getTransactionReceipt'?{...receipt,transactionIndex:'0x2'}:rpc(m),hash),
    /index outside/);
});
test('reject inconsistent transaction and receipt indices',async()=>{
  await assert.rejects(audit7702(async(m)=>
    m==='eth_getTransactionByHash'?{...tx,transactionIndex:'0x1'}:rpc(m),hash),
    /indices disagree/);
});
test('reject receipt without canonical transaction index',async()=>{
  const {transactionIndex, ...missing}=receipt;
  await assert.rejects(audit7702(async(m)=>
    m==='eth_getTransactionReceipt'?missing:rpc(m),hash),
    /Missing receipt transaction index/);
});
