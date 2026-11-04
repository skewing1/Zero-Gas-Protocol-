// Synthetic accounting fixtures test the gate, never reported as measured gas.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
const program = new URL('./epoch-decision.mjs', import.meta.url).pathname;
const names = ['fresh-unique','fresh-distinct-payers','one-payer-1000','one-payer-10000',
  'hundred-payers-10000','one-payer-10000-irregular','unique-payers-unique-payees-1000'];
const summary = gas => ({gas,feeWei:String(gas)});
function fixture(protocolGas) {
  return names.flatMap(name => ['native','token'].map(asset => ({
    scenario:{name},asset,baseline:summary(1_000_000),baselineNet:summary(1000),
    cold:summary(protocolGas),sharedSetup:summary(0),
    receipts:{direct:[summary(1_000_000)],directNet:[summary(1000)],epoch:[summary(protocolGas)],setup:[]},
    balanceEquivalence:{p0:['1'],p0Net:['1'],epoch:['1']},
  })));
}
function evaluate(rows) {
  const cwd=mkdtempSync(join(tmpdir(),'epoch-decision-'));
  try {
    mkdirSync(join(cwd,'bench'));
    writeFileSync(join(cwd,'bench/epoch-results.json'),JSON.stringify(rows));
    execFileSync(process.execPath,[program],{cwd,stdio:'pipe'});
    return readFileSync(join(cwd,'bench/epoch-decision.md'),'utf8');
  } finally { rmSync(cwd,{recursive:true,force:true}); }
}
test('large savings against P0 cannot pass a failing P0-net comparison',()=>{
  const report=evaluate(fixture(5000));
  assert.match(report,/99\.50% \| -400\.00% \| FAIL \| FAIL/);
  assert.match(report,/90% across all measured controls versus P0-net: \*\*FAIL\*\*/);
});
test('90 and 99 percent boundaries use P0-net exactly',()=>{
  assert.match(evaluate(fixture(100)),/90\.00% \| PASS \| FAIL/);
  assert.match(evaluate(fixture(10)),/99\.00% \| PASS \| PASS/);
  assert.match(evaluate(fixture(101)),/89\.90% \| FAIL \| FAIL/);
});
test('missing large independent control, missing P0-net, mismatched balances and totals fail closed',()=>{
  const missing=fixture(10).filter(row=>row.scenario.name!=='unique-payers-unique-payees-1000');
  assert.throws(()=>evaluate(missing));
  const noNet=fixture(10); delete noNet[0].baselineNet; assert.throws(()=>evaluate(noNet));
  const mismatched=fixture(10); mismatched[0].balanceEquivalence.p0Net=['2']; assert.throws(()=>evaluate(mismatched));
  const incorrect=fixture(10); incorrect[0].baselineNet.gas=1001; assert.throws(()=>evaluate(incorrect));
});
