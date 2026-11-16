import test from 'node:test';
import assert from 'node:assert/strict';
import { compareAllIn } from './all-in-comparison.mjs';
const row = (path, settlement, prefund, deployment, balances=['1']) => ({path,feeWei:String(settlement),prefunding:{feeWei:String(prefund)},deployment:{feeWei:String(deployment)},allInFeeWei:String(settlement+prefund+deployment),finalBalances:balances});
test('prefunding and deployment change apparent 50% to real 20%',()=>{
  const result=compareAllIn([row('P0',200,0,0),row('P1',100,40,20)]);
  assert.equal(result[1].savingsBps,'2000');assert.equal(result[1].exceeds45Percent,false);
});
test('savings >45% only with reconciled receipts',()=>assert.equal(compareAllIn([row('P0',200,0,0),row('P1',100,0,0)])[1].exceeds45Percent,true));
test('reject unequal recipient outcomes',()=>assert.throws(()=>compareAllIn([row('P0',200,0,0),row('P1',100,0,0,['2'])]),/Different/));
test('reject forged all-in total',()=>{const x=row('P1',100,0,0);x.allInFeeWei='1';assert.throws(()=>compareAllIn([row('P0',200,0,0),x]),/reconcile/)});
test('reject missing evidence',()=>{const x=row('P1',100,0,0);delete x.prefunding;assert.throws(()=>compareAllIn([row('P0',200,0,0),x]),/Invalid/)});
test('negative savings remains negative',()=>assert.equal(compareAllIn([row('P0',100,0,0),row('P1',200,0,0)])[1].savingsBps,'-10000'));
