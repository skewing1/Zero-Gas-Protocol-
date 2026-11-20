import test from 'node:test';import assert from 'node:assert/strict';import {compareAllInCosts} from './compare-all-in-costs.mjs';
const p=(id,gas)=>({id,outcomes:[{recipient:'0x'+'ab'.repeat(20),receivedWei:'100'}],receipts:[{transactionHash:'0x'+(id==='baseline'?'11':'22').repeat(32),status:'success',gasUsed:gas,effectiveGasPriceWei:'1',l1DataFeeWei:'0',blobGasUsed:'0',blobGasPriceWei:'0',blobFeeWei:'0'}],relayerCompensationWei:'0',relayerOperatingCostWei:'0',deploymentCostWei:'0',settlementCostWei:'0',otherCostWei:'0'});
const fixture=()=>({paths:[p('baseline','100'),p('candidate','50')]});
test('verified 50 percent',()=>assert.equal(compareAllInCosts(fixture()).savingsBasisPoints,'5000'));
test('unknown cost forbids claim',()=>{const x=fixture();x.paths[1].settlementCostWei=null;assert.equal(compareAllInCosts(x).savingsBasisPoints,null)});
test('different recipients rejected',()=>{const x=fixture();x.paths[1].outcomes[0].receivedWei='99';assert.throws(()=>compareAllInCosts(x),/outcomes differ/)});
test('duplicate receipt rejected',()=>{const x=fixture();x.paths[0].receipts.push(x.paths[0].receipts[0]);assert.throws(()=>compareAllInCosts(x),/receipt/)});
test('L1 fee counted',()=>{const x=fixture();x.paths[1].receipts[0].l1DataFeeWei='60';assert.equal(compareAllInCosts(x).savingsBasisPoints,'-1000')});
test('missing costs fail closed',()=>{const x=fixture();delete x.paths[0].otherCostWei;assert.throws(()=>compareAllInCosts(x),/canonical/)});
test('reverted receipt rejected',()=>{const x=fixture();x.paths[1].receipts[0].status='reverted';assert.throws(()=>compareAllInCosts(x),/receipt/)});

test('complete supplied inputs are not authenticated mined receipts',()=>{const r=compareAllInCosts(fixture());assert.equal(r.costInputsComplete,true);assert.equal(r.verifiedAllIn,false);assert.equal(r.measuredSavingsBasisPoints,null);assert.equal(r.exceeds45Percent,null)});
test('unknown expense is not complete or verified',()=>{const x=fixture();x.paths[0].relayerOperatingCostWei=null;const r=compareAllInCosts(x);assert.equal(r.costInputsComplete,false);assert.equal(r.verifiedAllIn,false);assert.equal(r.exceeds45Percent,null)});

test('relayer compensation reduces payer savings',()=>{const x=fixture();x.paths[1].relayerCompensationWei='20';const r=compareAllInCosts(x);assert.equal(r.savingsBasisPoints,'3000');assert.equal(r.verifiedAllIn,false)});
test('unknown relayer compensation forbids scenario savings',()=>{const x=fixture();x.paths[1].relayerCompensationWei=null;const r=compareAllInCosts(x);assert.equal(r.costInputsComplete,false);assert.equal(r.savingsBasisPoints,null);assert.deepEqual(r.missingCosts,['candidate.relayerCompensationWei'])});
test('omitted relayer compensation fails closed',()=>{const x=fixture();delete x.paths[1].relayerCompensationWei;assert.throws(()=>compareAllInCosts(x),/canonical unsigned wei/)});
test('relayer compensation is separate from operating expense',()=>{const x=fixture();x.paths[1].relayerCompensationWei='10';x.paths[1].relayerOperatingCostWei='5';assert.equal(compareAllInCosts(x).savingsBasisPoints,'3500')});

test('blob gas fee components counted',()=>{const x=fixture();Object.assign(x.paths[1].receipts[0],{blobGasUsed:'5',blobGasPriceWei:'2',blobFeeWei:'10'});assert.equal(compareAllInCosts(x).savingsBasisPoints,'4000')});
test('forged blob fee rejected',()=>{const x=fixture();Object.assign(x.paths[1].receipts[0],{blobGasUsed:'5',blobGasPriceWei:'2',blobFeeWei:'0'});assert.throws(()=>compareAllInCosts(x),/Blob fee mismatch/)});
test('omitted blob usage rejected',()=>{const x=fixture();delete x.paths[1].receipts[0].blobGasUsed;assert.throws(()=>compareAllInCosts(x),/canonical unsigned wei/)});
test('zero gas receipt rejected',()=>{const x=fixture();x.paths[1].receipts[0].gasUsed='0';assert.throws(()=>compareAllInCosts(x),/gasUsed must be positive/)});

test('same transaction cannot prove both paths',()=>{const x=fixture();x.paths[1].receipts[0].transactionHash=x.paths[0].receipts[0].transactionHash;assert.throws(()=>compareAllInCosts(x),/Receipt reused across baseline and candidate/)});
test('cross-path receipt hash comparison is case insensitive',()=>{const x=fixture();x.paths[1].receipts[0].transactionHash=x.paths[0].receipts[0].transactionHash.toUpperCase().replace('0X','0x');assert.throws(()=>compareAllInCosts(x),/Receipt reused across baseline and candidate/)});
