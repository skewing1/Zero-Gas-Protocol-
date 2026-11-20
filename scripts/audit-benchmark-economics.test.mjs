import { test } from 'node:test';
import assert from 'node:assert/strict';
import { auditEconomics } from './audit-benchmark-economics.mjs';
const fixture = () => ['W1','W2','W3','W4'].flatMap(workload => ['native','token'].map(asset => ({
  workload, asset, paths: (asset === 'native' ? ['P0','P1','P1-net','P2'] : ['P0','P1','P1-net']).map(path => ({
    path, feeWei:'20', lifecycleFeeWei:'20', gas:10, txCount:1, calldataBytes:4,
    lifecycleSavingsBps:'0', receipts:[{stage:'settlement',feeWei:'20',gasUsed:10,calldataBytes:4}]
  }))
})));
test('accepts reconciled economics without claiming all-in savings', () => {
  const result = auditEconomics(fixture());
  assert.equal(result.length, 28);
  assert(result.every(x => x.allInSavingsVerified === false));
});
test('rejects inflated savings', () => { const x=fixture(); x[0].paths[1].lifecycleSavingsBps='5000'; assert.throws(()=>auditEconomics(x),/Savings/); });
test('rejects gas aggregate tampering', () => { const x=fixture(); x[0].paths[1].gas=1; assert.throws(()=>auditEconomics(x),/gas mismatch/); });
test('rejects transaction count tampering', () => { const x=fixture(); x[0].paths[1].txCount=2; assert.throws(()=>auditEconomics(x),/Transaction count/); });
test('rejects calldata aggregate tampering', () => { const x=fixture(); x[0].paths[1].calldataBytes=5; assert.throws(()=>auditEconomics(x),/Calldata total/); });
test('rejects lifecycle fee tampering', () => { const x=fixture(); x[0].paths[1].lifecycleFeeWei='10'; assert.throws(()=>auditEconomics(x),/Lifecycle fee/); });
test('rejects zero baseline', () => { const x=fixture(); x[0].paths[0].lifecycleFeeWei='0'; assert.throws(()=>auditEconomics(x),/Zero conventional/); });
