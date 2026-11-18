import test from 'node:test';
import assert from 'node:assert/strict';
import { compareVerifiedRuns } from './verified-savings-gate.mjs';
const hash = n => '0x' + n.toString(16).padStart(64,'0');
function run(gas, n) {
 return { chainId:'31337', workloadHash:hash(1), paymentCount:10, outcomeVerified:true, receiptsVerified:true, costCoverageVerified:true, deploymentReceiptsIncluded:true,
 receipts:[{hash:hash(n),status:'0x1',gasUsed:String(gas),effectiveGasPrice:'1',l1FeeWei:'0',blobFeeWei:'0'}],
 extraCosts:Object.fromEntries(['relayerWei','rpcWei','authorizationWei','deploymentWei','settlementWei','liquidityWei','dataWei','otherWei'].map(k=>[k,'0'])) };
}
test('strictly above 45 percent',()=>{ assert.equal(compareVerifiedRuns(run(100,2),run(54,3)).exceeds45Percent,true); assert.equal(compareVerifiedRuns(run(100,2),run(55,3)).exceeds45Percent,false); });
test('negative savings',()=>assert.equal(compareVerifiedRuns(run(100,2),run(120,3)).savingsBps,'-2000'));
test('extra costs reverse nominal savings',()=>{const c=run(40,3);c.extraCosts.relayerWei='70';assert.equal(compareVerifiedRuns(run(100,2),c).exceeds45Percent,false);});
test('reject missing L2 fee evidence',()=>{const c=run(40,3);delete c.receipts[0].l1FeeWei;assert.throws(()=>compareVerifiedRuns(run(100,2),c));});
test('reject unverified cost coverage',()=>{const c=run(40,3);c.costCoverageVerified=false;assert.throws(()=>compareVerifiedRuns(run(100,2),c));});
test('reject mismatched outcomes',()=>{const c=run(40,3);c.workloadHash=hash(5);assert.throws(()=>compareVerifiedRuns(run(100,2),c));});
test('reject duplicate receipts',()=>{const c=run(40,3);c.receipts.push({...c.receipts[0]});assert.throws(()=>compareVerifiedRuns(run(100,2),c));});
test('reject double-counted deployment',()=>{const c=run(40,3);c.extraCosts.deploymentWei='1';assert.throws(()=>compareVerifiedRuns(run(100,2),c));});
test('reject unverified outcome',()=>{const c=run(40,3);c.outcomeVerified=false;assert.throws(()=>compareVerifiedRuns(run(100,2),c));});

test('reject receipt reused across baseline and candidate',()=>{const b=run(100,2);const c=run(40,2);assert.throws(()=>compareVerifiedRuns(b,c),/Reused receipt/);});
test('reject case-insensitive receipt reuse',()=>{const b=run(100,0xab);const c=run(40,0xcd);c.receipts[0].hash=b.receipts[0].hash.toUpperCase().replace('0X','0x');assert.throws(()=>compareVerifiedRuns(b,c),/Reused receipt/);});

test('caller assertions cannot establish independent verification',()=>{
 const result=compareVerifiedRuns(run(100,2),run(40,3));
 assert.equal(result.evidenceChecksPassed,true);
 assert.equal(result.verified,false);
 assert.equal(result.exceeds45Percent,true);
});

test('negative fractional basis points round toward loss, not zero',()=>{
 const result=compareVerifiedRuns(run(30000,2),run(30001,3));
 assert.equal(result.savingsBps,'-1');
 assert.equal(result.exceeds45Percent,false);
 assert.equal(result.verified,false);
});
test('positive fractional basis points do not round upward',()=>{
 const result=compareVerifiedRuns(run(30000,2),run(29999,3));
 assert.equal(result.savingsBps,'0');
});
