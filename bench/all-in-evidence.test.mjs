import test from 'node:test';
import assert from 'node:assert/strict';
import {compareEvidence} from './all-in-evidence.mjs';
const A='0x'+'11'.repeat(20), B='0x'+'22'.repeat(20);
function side(gas, delta='100', extra='0') {
 return {chainId:'8453',recipients:[{address:A,deltaWei:delta}],transactions:[{hash:'0x'+'ab'.repeat(32),status:'0x1',gasUsed:gas,effectiveGasPrice:'1',from:A,to:B}],extras:{relayerWei:extra,dataWei:'0',settlementWei:'0',authorizationWei:'0',deploymentWei:'0'}};
}
test('identical outcomes with >45% reduction',()=>{const r=compareEvidence({baseline:side('100'),candidate:side('50')});assert.equal(r.savingsBasisPoints,'5000');assert.equal(r.exceeds45Percent,true)});
test('exact 45% does not exceed target',()=>assert.equal(compareEvidence({baseline:side('100'),candidate:side('55')}).exceeds45Percent,false));
test('relayer costs erase nominal savings',()=>assert.equal(compareEvidence({baseline:side('100'),candidate:side('40','100','70')}).savingsBasisPoints,'-1000'));
test('recipient mismatch fails closed',()=>assert.throws(()=>compareEvidence({baseline:side('100'),candidate:side('40','99')}),/outcome mismatch/));
test('chain mismatch fails closed',()=>{const c=side('40');c.chainId='1';assert.throws(()=>compareEvidence({baseline:side('100'),candidate:c}),/chain mismatch/)});
test('missing fee category fails closed',()=>{const c=side('40');delete c.extras.dataWei;assert.throws(()=>compareEvidence({baseline:side('100'),candidate:c}),/dataWei/)});
test('failed receipt fails closed',()=>{const c=side('40');c.transactions[0].status='0x0';assert.throws(()=>compareEvidence({baseline:side('100'),candidate:c}),/failed/)});
test('duplicate receipt fails closed',()=>{const c=side('40');c.transactions.push({...c.transactions[0]});assert.throws(()=>compareEvidence({baseline:side('100'),candidate:c}),/duplicate/)});
test('fractional fee fails closed',()=>{const c=side('40');c.extras.relayerWei='0.5';assert.throws(()=>compareEvidence({baseline:side('100'),candidate:c}),/decimal/)});
test('huge wei remains exact',()=>{const r=compareEvidence({baseline:side('100000000000000000000'),candidate:side('1')});assert.equal(r.savedWei,'99999999999999999999')});
