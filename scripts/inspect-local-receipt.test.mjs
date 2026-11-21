import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectMinedReceipt,localRpc} from './inspect-local-receipt.mjs';
const tx='0x'+'11'.repeat(32), bh='0x'+'22'.repeat(32);
const fixture=()=>({
 eth_chainId:'0x7a69',
 eth_getTransactionReceipt:{transactionHash:tx,blockHash:bh,blockNumber:'0x5',status:'0x1',type:'0x4',gasUsed:'0x5208',effectiveGasPrice:'0x2'},
 eth_getBlockByHash:{hash:bh,number:'0x5',transactions:[tx]},
 eth_getBlockByNumber:{hash:bh,number:'0x5',transactions:[tx]},
 eth_getTransactionByHash:{hash:tx,blockHash:bh,type:'0x4'}
});
const inspect=(f)=>inspectMinedReceipt(async method=>f[method],tx,31337);
test('canonical type-4 receipt reconciles execution fee but not all-in savings',async()=>{
 const r=await inspect(fixture());
 assert.equal(r.transactionType,'4');assert.equal(r.executionFeeWei,'42000');
 assert.equal(r.verifiedAllIn,false);assert.equal(r.recipientOutcomesVerified,false);
});
test('chain mismatch fails',async()=>assert.rejects(inspectMinedReceipt(async method=>fixture()[method],tx,1),/chain ID/));
test('reverted transaction fails',async()=>{const f=fixture();f.eth_getTransactionReceipt.status='0x0';await assert.rejects(inspect(f),/failed/)});
test('noncanonical receipt block fails',async()=>{const f=fixture();f.eth_getBlockByNumber.hash='0x'+'33'.repeat(32);await assert.rejects(inspect(f),/not canonical/)});
test('missing transaction in block fails',async()=>{const f=fixture();f.eth_getBlockByHash.transactions=[];await assert.rejects(inspect(f),/absent/)});
test('transaction inclusion mismatch fails',async()=>{const f=fixture();f.eth_getTransactionByHash.blockHash='0x'+'33'.repeat(32);await assert.rejects(inspect(f),/inclusion/)});
test('zero gas receipt fails',async()=>{const f=fixture();f.eth_getTransactionReceipt.gasUsed='0x0';await assert.rejects(inspect(f),/Zero gas/)});
test('non-loopback RPC endpoints rejected',()=>{assert.throws(()=>localRpc('https://rpc.example.org'),/loopback/);assert.throws(()=>localRpc('http://192.168.1.1:8545'),/loopback/)});
