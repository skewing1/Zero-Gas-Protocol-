import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectType4Transaction,inspectMinedType4} from './type4-authorization-evidence.mjs';
const h='0x'+'a'.repeat(64),b='0x'+'b'.repeat(64),addr='0x'+'c'.repeat(40);
const tx=()=>({hash:h,type:'0x4',chainId:'0x7a69',blockHash:b,blockNumber:'0x1',transactionIndex:'0x0',authorizationList:[{chainId:'0x7a69',address:addr,nonce:'0x0',yParity:'0x1',r:h,s:b}]});
test('valid authorization remains unverified',()=>{const x=inspectType4Transaction(tx(),'0x7a69');assert.equal(x.authorizationCount,1);assert.equal(x.signatureVerified,false)});
test('rejects legacy type',()=>{const x=tx();x.type='0x2';assert.throws(()=>inspectType4Transaction(x,'0x7a69'),/type-4/)});
test('rejects empty authorizations',()=>{const x=tx();x.authorizationList=[];assert.throws(()=>inspectType4Transaction(x,'0x7a69'),/authorization list/)});
test('rejects foreign chain',()=>{const x=tx();x.authorizationList[0].chainId='0x1';assert.throws(()=>inspectType4Transaction(x,'0x7a69'),/chain mismatch/)});
test('accepts chain-neutral authorization',()=>{const x=tx();x.authorizationList[0].chainId='0x0';assert.equal(inspectType4Transaction(x,'0x7a69').authorizationCount,1)});
test('rejects malformed signature scalar',()=>{const x=tx();x.authorizationList[0].r='0x0';assert.throws(()=>inspectType4Transaction(x,'0x7a69'),/32-byte/)});
test('rejects invalid parity',()=>{const x=tx();x.authorizationList[0].yParity='0x2';assert.throws(()=>inspectType4Transaction(x,'0x7a69'),/yParity/)});
test('rejects reverted receipt',async()=>{const rpc=async m=>m==='eth_chainId'?'0x7a69':m==='eth_getTransactionByHash'?tx():m==='eth_getBlockByHash'?{hash:b,number:'0x1',transactions:[h]}:m==='eth_getBlockByNumber'?{hash:b,number:'0x1'}:{transactionHash:h,type:'0x4',status:'0x0',blockHash:b,blockNumber:'0x1',transactionIndex:'0x0'};await assert.rejects(()=>inspectMinedType4({rpc,transactionHash:h}),/reverted/)});
test('accepts matching mined evidence without claiming savings',async()=>{const rpc=async m=>m==='eth_chainId'?'0x7a69':m==='eth_getTransactionByHash'?tx():m==='eth_getBlockByHash'?{hash:b,number:'0x1',transactions:[h]}:m==='eth_getBlockByNumber'?{hash:b,number:'0x1'}:{transactionHash:h,type:'0x4',status:'0x1',blockHash:b,blockNumber:'0x1',transactionIndex:'0x0'};assert.equal((await inspectMinedType4({rpc,transactionHash:h})).claimableSavings,false)});

test('rejects zero scalar even when encoded as 32 bytes',()=>{const x=tx();x.authorizationList[0].r='0x'+'0'.repeat(64);assert.throws(()=>inspectType4Transaction(x,'0x7a69'),/scalar range/)});
test('rejects scalar equal to secp256k1 group order',()=>{const x=tx();x.authorizationList[0].r='0x'+'fffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141';assert.throws(()=>inspectType4Transaction(x,'0x7a69'),/scalar range/)});
test('rejects scalar above secp256k1 group order',()=>{const x=tx();x.authorizationList[0].s='0x'+'fffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364142';assert.throws(()=>inspectType4Transaction(x,'0x7a69'),/scalar range/)});
test('accepts maximal scalar below secp256k1 order structurally',()=>{const x=tx();x.authorizationList[0].r='0x'+'fffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364140';assert.equal(inspectType4Transaction(x,'0x7a69').signatureVerified,false)});

test('rejects forged receipt block height',async()=>{
 const rpc=async m=>m==='eth_chainId'?'0x7a69':m==='eth_getTransactionByHash'?tx():m==='eth_getBlockByHash'?{hash:b,number:'0x1',transactions:[h]}:m==='eth_getBlockByNumber'?{hash:b,number:'0x1'}:{transactionHash:h,type:'0x4',status:'0x1',blockHash:b,blockNumber:'0x2',transactionIndex:'0x0'};
 await assert.rejects(()=>inspectMinedType4({rpc,transactionHash:h}),/height mismatch/);
});
test('rejects transaction index disagreement',async()=>{
 const rpc=async m=>m==='eth_chainId'?'0x7a69':m==='eth_getTransactionByHash'?tx():m==='eth_getBlockByHash'?{hash:b,number:'0x1',transactions:[h]}:m==='eth_getBlockByNumber'?{hash:b,number:'0x1'}:{transactionHash:h,type:'0x4',status:'0x1',blockHash:b,blockNumber:'0x1',transactionIndex:'0x1'};
 await assert.rejects(()=>inspectMinedType4({rpc,transactionHash:h}),/position mismatch/);
});
test('rejects wrong hash at claimed block index',async()=>{
 const rpc=async m=>m==='eth_chainId'?'0x7a69':m==='eth_getTransactionByHash'?tx():m==='eth_getBlockByHash'?{hash:b,number:'0x1',transactions:['0x'+'d'.repeat(64)]}:{transactionHash:h,type:'0x4',status:'0x1',blockHash:b,blockNumber:'0x1',transactionIndex:'0x0'};
 await assert.rejects(()=>inspectMinedType4({rpc,transactionHash:h}),/absent at mined block index/);
});
test('rejects unavailable canonical block',async()=>{
 const rpc=async m=>m==='eth_chainId'?'0x7a69':m==='eth_getTransactionByHash'?tx():m==='eth_getBlockByHash'?null:{transactionHash:h,type:'0x4',status:'0x1',blockHash:b,blockNumber:'0x1',transactionIndex:'0x0'};
 await assert.rejects(()=>inspectMinedType4({rpc,transactionHash:h}),/Mined block missing/);
});

const receipt=()=>({transactionHash:h,type:'0x4',status:'0x1',blockHash:b,blockNumber:'0x1',transactionIndex:'0x0'});
const canonicalRpc=({canonicalHash=b,headNumber='0x1',changeOnRecheck=false}={})=>{
 let heightReads=0;
 return async (method,args)=>{
  if(method==='eth_chainId')return '0x7a69';
  if(method==='eth_getTransactionByHash')return tx();
  if(method==='eth_getTransactionReceipt')return receipt();
  if(method==='eth_getBlockByHash')return {hash:b,number:'0x1',transactions:[h]};
  if(method==='eth_getBlockByNumber'){
   if(args[0]==='latest')return {hash:'0x'+'f'.repeat(64),number:headNumber};
   heightReads++;
   return {hash:changeOnRecheck&&heightReads>1?'0x'+'d'.repeat(64):canonicalHash,number:'0x1'};
  }
  throw Error('Unexpected RPC method '+method);
 };
};
test('rejects orphaned receipt even when block-by-hash exists',async()=>{
 await assert.rejects(()=>inspectMinedType4({rpc:canonicalRpc({canonicalHash:'0x'+'d'.repeat(64)}),transactionHash:h}),/not canonical/);
});
test('rejects insufficient confirmation depth',async()=>{
 await assert.rejects(()=>inspectMinedType4({rpc:canonicalRpc(),transactionHash:h,minConfirmations:2}),/Insufficient confirmations/);
});
test('accepts sufficient depth without asserting finality or savings',async()=>{
 const evidence=await inspectMinedType4({rpc:canonicalRpc({headNumber:'0x3'}),transactionHash:h,minConfirmations:3});
 assert.equal(evidence.claimableSavings,false);
 assert.equal(evidence.signatureVerified,false);
});
test('rejects canonical block changing during inspection',async()=>{
 await assert.rejects(()=>inspectMinedType4({rpc:canonicalRpc({changeOnRecheck:true}),transactionHash:h}),/changed during inspection/);
});
test('rejects invalid confirmation policy',async()=>{
 await assert.rejects(()=>inspectMinedType4({rpc:canonicalRpc(),transactionHash:h,minConfirmations:0}),/Invalid minimum confirmations/);
});

test('rejects same-height head hash replacement during inspection',async()=>{
 let heads=0;
 const rpc=async(method,args)=>{
  if(method==='eth_chainId')return '0x7a69';
  if(method==='eth_getTransactionByHash')return tx();
  if(method==='eth_getTransactionReceipt')return receipt();
  if(method==='eth_getBlockByHash')return {hash:b,number:'0x1',transactions:[h]};
  if(method==='eth_getBlockByNumber'){
   if(args[0]==='latest')return {number:'0x2',hash:'0x'+(++heads===1?'a':'c').repeat(64)};
   return {number:'0x1',hash:b};
  }
  throw Error('unexpected method');
 };
 await assert.rejects(()=>inspectMinedType4({rpc,transactionHash:h}),/head changed/);
});
test('rejects chain tip height regression during inspection',async()=>{
 let heads=0;
 const rpc=async(method,args)=>{
  if(method==='eth_chainId')return '0x7a69';
  if(method==='eth_getTransactionByHash')return tx();
  if(method==='eth_getTransactionReceipt')return receipt();
  if(method==='eth_getBlockByHash')return {hash:b,number:'0x1',transactions:[h]};
  if(method==='eth_getBlockByNumber'){
   if(args[0]==='latest')return {number:++heads===1?'0x3':'0x2',hash:'0x'+'a'.repeat(64)};
   return {number:'0x1',hash:b};
  }
  throw Error('unexpected method');
 };
 await assert.rejects(()=>inspectMinedType4({rpc,transactionHash:h}),/height regressed/);
});
test('allows ordinary tip extension while retaining conservative evidence flags',async()=>{
 let heads=0;
 const rpc=async(method,args)=>{
  if(method==='eth_chainId')return '0x7a69';
  if(method==='eth_getTransactionByHash')return tx();
  if(method==='eth_getTransactionReceipt')return receipt();
  if(method==='eth_getBlockByHash')return {hash:b,number:'0x1',transactions:[h]};
  if(method==='eth_getBlockByNumber'){
   if(args[0]==='latest')return {number:++heads===1?'0x2':'0x3',hash:'0x'+'a'.repeat(64)};
   return {number:'0x1',hash:b};
  }
  throw Error('unexpected method');
 };
 const evidence=await inspectMinedType4({rpc,transactionHash:h,minConfirmations:2});
 assert.equal(evidence.claimableSavings,false);
});
