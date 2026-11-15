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
