import test from 'node:test';
import assert from 'node:assert/strict';
import { auditGroups } from './audit-receipts.mjs';
const receipt = (hash, stage, gasUsed) => ({ hash, stage, gasUsed, effectiveGasPrice:'2',
  feeWei: String(gasUsed * 2) });
const path = (name, gas, deployment = 0) => ({
  path:name, receipts:[receipt(name+'-deploy','deployment',deployment),receipt(name+'-pay','settlement',gas)],
  feeWei:String(gas*2), deployment:{feeWei:String(deployment*2)}, txCount:1, finalBalances:['100']
});
const groups = () => [{workload:'W',asset:'native',paths:[path('P0',100),path('P1-net',50)]}];
test('audits actual receipts and meets 45 percent with identical balances',()=>{
 const [r]=auditGroups(groups()); assert.equal(r.savingsBasisPoints,'5000'); assert.equal(r.meets45Percent,true);
});
test('deployment and explicit relayer overhead count against savings',()=>{
 const g=groups(); g[0].paths[1]=path('P1-net',50,50);
 const [r]=auditGroups(g,{overhead:{'P1-net':{relayerWei:'10'}}});
 assert.equal(r.savingsBasisPoints,'-500'); assert.equal(r.meets45Percent,false);
});
test('rejects tampered fees, duplicate hashes and non-equivalent balances',()=>{
 const g=groups();g[0].paths[1].receipts[1].feeWei='1';
 assert.throws(()=>auditGroups(g),/Receipt fee mismatch/);
 const h=groups();h[0].paths[1].receipts[1].hash=h[0].paths[1].receipts[0].hash;
 assert.throws(()=>auditGroups(h),/Duplicate transaction/);
 const i=groups();i[0].paths[1].finalBalances=['101'];
 assert.throws(()=>auditGroups(i),/Different final/);
});
test('rejects missing comparison and unknown stages',()=>{
 assert.throws(()=>auditGroups(groups(),{candidate:'P2'}),/Missing comparison/);
 const g=groups();g[0].paths[1].receipts[1].stage='unknown';
 assert.throws(()=>auditGroups(g),/Unknown receipt stage/);
});

test('caller overhead cannot overwrite measured deployment fees',()=>{
 const g=groups();
 g[0].paths[1]=path('P1-net',50,50);
 const [r]=auditGroups(g,{overhead:{'P1-net':{amortizedDeploymentWei:'0',relayerWei:'10'}}});
 assert.equal(r.candidateWei,'210');
 assert.equal(r.savingsBasisPoints,'-500');
 assert.equal(r.meets45Percent,false);
});

test('rejects caller overhead that attempts to replace measured receipts', () => {
 const g=groups();
 assert.throws(() => auditGroups(g,{overhead:{'P1-net':{receipts:[]}}}), /Unknown overhead field/);
 assert.throws(() => auditGroups(g,{overhead:{'P1-net':{totalWei:'0'}}}), /Unknown overhead field/);
});
test('allows explicit relayer overhead without modifying receipt totals', () => {
 const [r]=auditGroups(groups(),{overhead:{'P1-net':{relayerWei:'10'}}});
 assert.equal(r.candidateWei,'110');
 assert.equal(r.savingsBasisPoints,'4500');
 assert.equal(r.meets45Percent,true);
});

test('rejects failed receipt status and missing transaction identity', () => {
 const failed=groups(); failed[0].paths[1].receipts[1].status='0x0';
 assert.throws(()=>auditGroups(failed),/Unsuccessful benchmark receipt/);
 const missing=groups(); delete missing[0].paths[1].receipts[1].hash;
 assert.throws(()=>auditGroups(missing),/Missing transaction hash/);
 const blank=groups(); blank[0].paths[1].receipts[1].hash='   ';
 assert.throws(()=>auditGroups(blank),/Missing transaction hash/);
});

test('strict audit requires explicit mined success status', () => {
 const g=groups();
 assert.throws(() => auditGroups(g,{requireSuccessfulStatus:true}), /Missing mined receipt status/);
 for (const p of g[0].paths) for (const r of p.receipts) r.status='0x1';
 assert.equal(auditGroups(g,{requireSuccessfulStatus:true})[0].savingsBasisPoints,'5000');
});
test('prefund transaction hashes cannot duplicate settlement receipts', () => {
 const g=groups();
 const p=g[0].paths[1];
 p.receipts.push({...receipt(p.receipts[1].hash,'prefund',1),status:'0x1'});
 assert.throws(() => auditGroups(g),/Duplicate transaction hash including prefund/);
});
