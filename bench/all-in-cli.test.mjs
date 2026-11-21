import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const A='0x'+'11'.repeat(20), B='0x'+'22'.repeat(20);
function side(gas,hash){return {chainId:'8453',recipients:[{address:B,deltaWei:'100'}],transactions:[{hash:'0x'+hash.repeat(64),status:'0x1',gasUsed:gas,effectiveGasPrice:'1',from:A,to:B}],extras:{relayerWei:'0',dataWei:'0',settlementWei:'0',authorizationWei:'0',deploymentWei:'0'}};}
const fixture=JSON.stringify({baseline:side('100','a'),candidate:side('50','b')});
function run(args,input){return spawnSync(process.execPath,[new URL('./all-in-cli.mjs',import.meta.url).pathname,...args],{input,encoding:'utf8'});}
test('stdin valid evidence emits explicitly unverified result',()=>{const r=run(['-'],fixture);assert.equal(r.status,0,r.stderr);const j=JSON.parse(r.stdout);assert.equal(j.kind,'UNVERIFIED_SUPPLIED_EVIDENCE_COMPARISON');assert.equal(j.savingsBasisPoints,'5000');});
test('invalid JSON rejects without output',()=>{const r=run(['-'],'{bad');assert.equal(r.status,1);assert.equal(r.stdout,'');});
test('missing evidence rejects',()=>{const r=run(['-'],'{}');assert.equal(r.status,1);assert.match(r.stderr,/Evidence rejected/);});
test('size limit rejects',()=>{const r=run(['-'],' '.repeat(2_000_001));assert.equal(r.status,1);assert.match(r.stderr,/2 MB/);});
test('file input works',()=>{const dir=mkdtempSync(join(tmpdir(),'zg-'));try{const file=join(dir,'evidence.json');writeFileSync(file,fixture);const r=run([file]);assert.equal(r.status,0,r.stderr);}finally{rmSync(dir,{recursive:true,force:true});}});
test('missing argument fails',()=>{const r=run([]);assert.equal(r.status,1);assert.match(r.stderr,/usage/);});
