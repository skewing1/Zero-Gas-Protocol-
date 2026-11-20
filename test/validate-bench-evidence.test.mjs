import test from 'node:test';
import assert from 'node:assert/strict';
import { validateBench } from '../scripts/validate-bench-evidence.mjs';
const receipt = (n, stage = 'settlement') => ({ hash:'0x'+n.toString(16).padStart(64,'0'),feeWei:'10',stage });
function fixture() {
  let id=0;
  return ['W1','W2','W3','W4'].flatMap(workload => ['native','token'].map(asset => ({
    workload, asset, paths: (asset === 'native' ? ['P0','P1','P1-net','P2'] : ['P0','P1','P1-net']).map(path => ({
      path,receipts:[receipt(++id)],finalBalances:['100'],feeWei:'10',
      deployment:{feeWei:'0'},prefunding:{feeWei:'0'},lifecycleFeeWei:'10'
    }))
  })));
}
function rejects(change) { const groups=fixture(); change(groups); assert.throws(()=>validateBench(groups)); }
test('complete cohorts pass',()=>assert.equal(validateBench(fixture()),true));
test('duplicate cohort fails',()=>rejects(g=>g[1]=structuredClone(g[0])));
test('missing path fails',()=>rejects(g=>g[0].paths.pop()));
test('reordered path fails',()=>rejects(g=>g[0].paths.reverse()));
test('mismatched recipient outcomes fail',()=>rejects(g=>g[0].paths[1].finalBalances=['99']));
test('execution fee mismatch fails',()=>rejects(g=>g[0].paths[0].feeWei='9'));
test('lifecycle fee mismatch fails',()=>rejects(g=>g[0].paths[0].lifecycleFeeWei='11'));
test('duplicate receipt in path fails',()=>rejects(g=>g[0].paths[0].receipts.push(g[0].paths[0].receipts[0])));
test('malformed fee fails',()=>rejects(g=>g[0].paths[0].receipts[0].feeWei='1e9'));
test('snapshot reuse across paths is valid',()=>{const g=fixture();g[0].paths[1].receipts[0].hash=g[0].paths[0].receipts[0].hash;assert.equal(validateBench(g),true);});
