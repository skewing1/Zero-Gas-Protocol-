import test from 'node:test';
import assert from 'node:assert/strict';
import {captureRecipientBalances,pairSnapshots} from './rpc-outcomes.mjs';
const A='0x'+'a'.repeat(40),T='0x'+'b'.repeat(40),H='0x'+'1'.repeat(64);
const mock=(overrides={})=>async(method,params)=>{
 if(overrides[method])return overrides[method](params);
 if(method==='eth_chainId')return '0x7a69';
 if(method==='eth_getBlockByNumber')return {number:'0x10',hash:H};
 if(method==='eth_getBalance')return '0x20';
 if(method==='eth_call')return '0x'+'0'.repeat(63)+'a';
 throw Error('Unexpected RPC');
};
test('native balance pinned to canonical hash',async()=>{
 const calls=[];const rpc=async(m,p)=>{calls.push([m,p]);return mock()(m,p)};
 const s=await captureRecipientBalances({rpc,blockNumber:'0x10',recipients:[A]});
 assert.equal(s.recipients[0].balance,'32');
 assert.deepEqual(calls.find(x=>x[0]==='eth_getBalance')[1][1],{blockHash:H,requireCanonical:true});
 assert.equal(s.verifiedByTool,false);
});
test('ERC20 balanceOf at block hash',async()=>{
 const calls=[];const rpc=async(m,p)=>{calls.push([m,p]);return mock()(m,p)};
 const s=await captureRecipientBalances({rpc,blockNumber:'0x10',recipients:[A],asset:T});
 assert.equal(s.recipients[0].balance,'10');
 assert.equal(calls.find(x=>x[0]==='eth_call')[1][0].data,'0x70a08231'+A.slice(2).padStart(64,'0'));
});
test('rejects reorg during capture',async()=>{
 let count=0;const rpc=mock({eth_getBlockByNumber:()=>({number:'0x10',hash:++count===1?H:'0x'+'2'.repeat(64)})});
 await assert.rejects(captureRecipientBalances({rpc,blockNumber:'0x10',recipients:[A]}),/Reorganization/);
});
test('rejects unsupported block-hash RPC',async()=>{
 const rpc=mock({eth_getBalance:()=>{throw Error('unsupported EIP-1898')}});
 await assert.rejects(captureRecipientBalances({rpc,blockNumber:'0x10',recipients:[A]}),/unsupported/);
});
test('rejects duplicate recipients',async()=>{
 await assert.rejects(captureRecipientBalances({rpc:mock(),blockNumber:'0x10',recipients:[A,A.toUpperCase().replace('0X','0x')]}),/Duplicate/);
});
test('pairs snapshots only with increasing height',()=>{
 const b={chainId:'31337',asset:'native',blockNumber:'16',blockHash:H,recipients:[{address:A,balance:'5'}]};
 const a={...b,blockNumber:'17',blockHash:'0x'+'2'.repeat(64),recipients:[{address:A,balance:'9'}]};
 assert.equal(pairSnapshots(b,a).recipients[0].after,'9');
 assert.throws(()=>pairSnapshots(a,b),/Non-increasing/);
});

test('rejects forged negative or noncanonical balance evidence',()=>{
 const s={chainId:'31337',asset:'native',blockNumber:'16',blockHash:H,recipients:[{address:A,balance:'5'}]};
 const a={...s,blockNumber:'17',blockHash:'0x'+'2'.repeat(64)};
 for(const bad of ['-1','01','1.0','0x5',''])assert.throws(()=>pairSnapshots({...s,recipients:[{address:A,balance:bad}]},a),/Invalid snapshot balance/);
});
test('rejects malformed block provenance and recipient identity',()=>{
 const s={chainId:'31337',asset:'native',blockNumber:'16',blockHash:H,recipients:[{address:A,balance:'5'}]};
 const a={...s,blockNumber:'17',blockHash:'0x'+'2'.repeat(64)};
 assert.throws(()=>pairSnapshots({...s,blockHash:'0x1234'},a),/Invalid snapshot block hash/);
 assert.throws(()=>pairSnapshots({...s,chainId:'0'},a),/Invalid snapshot chain/);
 assert.throws(()=>pairSnapshots({...s,recipients:[{address:A.toUpperCase(),balance:'5'}]},a),/Invalid snapshot recipient address/);
 assert.throws(()=>pairSnapshots(s,{...a,blockHash:H}),/Identical block hash/);
});
