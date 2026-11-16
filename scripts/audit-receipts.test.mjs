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

test('CLI refuses legacy status-less evidence and accepts mined-success evidence', async () => {
 const { spawnSync } = await import('node:child_process');
 const { mkdtempSync, writeFileSync, rmSync } = await import('node:fs');
 const { tmpdir } = await import('node:os');
 const { join } = await import('node:path');
 const dir = mkdtempSync(join(tmpdir(), 'receipt-audit-'));
 try {
   const file = join(dir, 'results.json');
   writeFileSync(file, JSON.stringify(groups()));
   const legacy = spawnSync(process.execPath, ['scripts/audit-receipts.mjs', file], { encoding:'utf8' });
   assert.notEqual(legacy.status, 0);
   assert.match(legacy.stderr, /Missing mined receipt status/);
   const valid = groups();
   for (const p of valid[0].paths) for (const r of p.receipts) r.status='0x1';
   writeFileSync(file, JSON.stringify(valid));
   const authoritative = spawnSync(process.execPath, ['scripts/audit-receipts.mjs', file], { encoding:'utf8' });
   assert.equal(authoritative.status, 0, authoritative.stderr);
   assert.equal(JSON.parse(authoritative.stdout)[0].meets45Percent, true);
 } finally { rmSync(dir, {recursive:true,force:true}); }
});

test('all-in gate includes actual prefunding fees even when path totals exclude setup', () => {
 const g=groups();
 // Candidate has 50 gas units for settlement and 30 for prefunding, at 2 wei/gas.
 // 160 / 200 = 80% of baseline cost, so the apparent 50% saving is only 20%.
 const p=g[0].paths[1];
 p.receipts.push({...receipt('candidate-prefund','prefund',30),status:'0x1'});
 for (const row of g[0].paths[0].receipts) row.status='0x1';
 for (const row of p.receipts) row.status='0x1';
 const [r]=auditGroups(g,{requireSuccessfulStatus:true});
 assert.equal(r.candidateWei,'160');
 assert.equal(r.savingsBasisPoints,'2000');
 assert.equal(r.meets45Percent,false);
});

test('rejects forged prefunding fees and unknown prefunding stage', () => {
 const g=groups(); const p=g[0].paths[1];
 p.receipts.push({...receipt('prefund-forged','prefund',30),feeWei:'0'});
 assert.throws(() => auditGroups(g), /Receipt fee mismatch/);
 const h=groups(); h[0].paths[1].receipts.push(receipt('unknown','prefunding',30));
 assert.throws(() => auditGroups(h), /Unknown receipt stage/);
});
test('counts rollup blob fees and rejects forged blob-inclusive receipt fees', () => {
 const g=groups(); const p=g[0].paths[1];
 p.receipts[1].blobFee='40'; p.receipts[1].feeWei='140'; p.feeWei='140';
 const [result]=auditGroups(g);
 assert.equal(result.candidateWei,'140');
 assert.equal(result.savingsBasisPoints,'3000');
 const forged=groups(); forged[0].paths[1].receipts[1].blobFee='40';
 assert.throws(() => auditGroups(forged), /Receipt fee mismatch/);
});
