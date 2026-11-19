import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectType4Transaction,inspectMinedType4} from './type4-authorization-evidence.mjs';
const h='0x'+'a'.repeat(64),b='0x'+'b'.repeat(64),addr='0x'+'c'.repeat(40);
const tx=()=>({hash:h,type:'0x4',chainId:'0x7a69',blockHash:b,authorizationList:[{chainId:'0x7a69',address:addr,nonce:'0x0',yParity:'0x1',r:h,s:b}]});
test('valid authorization remains unverified',()=>{const x=inspectType4Transaction(tx(),'0x7a69');assert.equal(x.authorizationCount,1);assert.equal(x.signatureVerified,false)});
test('rejects legacy type',()=>{const x=tx();x.type='0x2';assert.throws(()=>inspectType4Transaction(x,'0x7a69'),/type-4/)});
test('rejects empty authorizations',()=>{const x=tx();x.authorizationList=[];assert.throws(()=>inspectType4Transaction(x,'0x7a69'),/authorization list/)});
test('rejects foreign chain',()=>{const x=tx();x.authorizationList[0].chainId='0x1';assert.throws(()=>inspectType4Transaction(x,'0x7a69'),/chain mismatch/)});
test('accepts chain-neutral authorization',()=>{const x=tx();x.authorizationList[0].chainId='0x0';assert.equal(inspectType4Transaction(x,'0x7a69').authorizationCount,1)});
test('rejects malformed signature scalar',()=>{const x=tx();x.authorizationList[0].r='0x0';assert.throws(()=>inspectType4Transaction(x,'0x7a69'),/32-byte/)});
test('rejects invalid parity',()=>{const x=tx();x.authorizationList[0].yParity='0x2';assert.throws(()=>inspectType4Transaction(x,'0x7a69'),/yParity/)});
test('rejects reverted receipt',async()=>{const rpc=async m=>m==='eth_chainId'?'0x7a69':m==='eth_getTransactionByHash'?tx():{transactionHash:h,type:'0x4',status:'0x0',blockHash:b};await assert.rejects(()=>inspectMinedType4({rpc,transactionHash:h}),/reverted/)});
test('accepts matching mined evidence without claiming savings',async()=>{const rpc=async m=>m==='eth_chainId'?'0x7a69':m==='eth_getTransactionByHash'?tx():{transactionHash:h,type:'0x4',status:'0x1',blockHash:b};assert.equal((await inspectMinedType4({rpc,transactionHash:h})).claimableSavings,false)});

test('rejects zero scalar even when encoded as 32 bytes',()=>{const x=tx();x.authorizationList[0].r='0x'+'0'.repeat(64);assert.throws(()=>inspectType4Transaction(x,'0x7a69'),/scalar range/)});
test('rejects scalar equal to secp256k1 group order',()=>{const x=tx();x.authorizationList[0].r='0x'+'fffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141';assert.throws(()=>inspectType4Transaction(x,'0x7a69'),/scalar range/)});
test('rejects scalar above secp256k1 group order',()=>{const x=tx();x.authorizationList[0].s='0x'+'fffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364142';assert.throws(()=>inspectType4Transaction(x,'0x7a69'),/scalar range/)});
test('accepts maximal scalar below secp256k1 order structurally',()=>{const x=tx();x.authorizationList[0].r='0x'+'fffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364140';assert.equal(inspectType4Transaction(x,'0x7a69').signatureVerified,false)});
