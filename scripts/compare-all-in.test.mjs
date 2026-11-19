import test from 'node:test';
import assert from 'node:assert/strict';
import {compareAllIn} from './compare-all-in.mjs';
const hash=n=>'0x'+n.repeat(64);
const side=(n,cost)=>({chainId:'31337',outcomeDigest:hash('f'),
  receipts:[{transactionHash:hash(n),canonical:true,success:true,executionWei:cost,blobWei:'0',dataWei:'0'}],
  relayerWei:'0',deploymentWei:'0',settlementWei:'0',bridgeWei:'0'});
const input=()=>({baseline:side('a','1000'),candidate:side('b','500')});
test('arithmetic does not claim independent verification',()=>{
  const r=compareAllIn(input());assert.equal(r.savingsBps,'5000');assert.equal(r.meetsTarget,true);assert.equal(r.verifiedByTool,false);
});
test('counts relayer, settlement and L2 data fees',()=>{
  const p=input();p.candidate.relayerWei='100';p.candidate.settlementWei='100';p.candidate.receipts[0].dataWei='100';
  assert.equal(compareAllIn(p).savingsBps,'2000');
});
test('rejects absent data fee evidence',()=>{
  const p=input();delete p.candidate.receipts[0].dataWei;assert.throws(()=>compareAllIn(p),/dataWei/);
});
test('rejects different outcomes',()=>{
  const p=input();p.candidate.outcomeDigest=hash('e');assert.throws(()=>compareAllIn(p),/Different payment outcomes/);
});
test('rejects duplicate receipts',()=>{
  const p=input();p.candidate.receipts.push({...p.candidate.receipts[0]});assert.throws(()=>compareAllIn(p),/duplicate transaction hash/);
});
test('rejects unverified receipt',()=>{
  const p=input();p.candidate.receipts[0].canonical=false;assert.throws(()=>compareAllIn(p),/not verified/);
});
test('rejects missing relayer fees',()=>{
  const p=input();delete p.candidate.relayerWei;assert.throws(()=>compareAllIn(p),/relayerWei/);
});
test('rejects different chains',()=>{
  const p=input();p.candidate.chainId='8453';assert.throws(()=>compareAllIn(p),/Different settlement chains/);
});
test('45 percent exactly does not exceed threshold',()=>{
  const p=input();p.candidate.receipts[0].executionWei='550';assert.equal(compareAllIn(p).meetsTarget,false);
});
test('negative savings are reported',()=>{
  const p=input();p.candidate.receipts[0].executionWei='1500';assert.equal(compareAllIn(p).savingsBps,'-5000');
});
