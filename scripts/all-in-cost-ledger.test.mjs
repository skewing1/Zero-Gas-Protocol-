import test from 'node:test';
import assert from 'node:assert/strict';
import {compareAllInCost} from './all-in-cost-ledger.mjs';
const h=n=>'0x'+n.toString(16).padStart(64,'0');
const overhead=()=>({relayerCompensationWei:'0',rpcInfrastructureWei:'0',proofAndSettlementWei:'0',deploymentAndAuthorizationWei:'0',otherDataAvailabilityWei:'0'});
const fixture=()=>({verifiedOutcomeDigest:h(1),baseline:{outcomeDigest:h(1),receipts:[{txHash:h(2),status:'success',gasUsed:'100',effectiveGasPriceWei:'10',additionalL1DataFeeWei:'0',additionalBlobFeeWei:'0'}],overhead:overhead()},candidate:{outcomeDigest:h(1),receipts:[{txHash:h(3),status:'success',gasUsed:'50',effectiveGasPriceWei:'10',additionalL1DataFeeWei:'0',additionalBlobFeeWei:'0'}],overhead:overhead()}});
test('computes costs but never attests evidence',()=>{const x=compareAllInCost(fixture());assert.equal(x.savingsBps,'5000');assert.equal(x.modeledAbove45Percent,true);assert.match(x.evidenceLevel,/UNATTESTED/);});
test('operating costs can reverse nominal gas savings',()=>{const x=fixture();x.candidate.overhead.relayerCompensationWei='600';assert.equal(compareAllInCost(x).savingsBps,'-1000');});
test('L2 data and blob fees are included',()=>{const x=fixture();x.candidate.receipts[0].additionalL1DataFeeWei='200';x.candidate.receipts[0].additionalBlobFeeWei='100';assert.equal(compareAllInCost(x).candidateWei,'800');});
test('outcome mismatch rejected',()=>{const x=fixture();x.candidate.outcomeDigest=h(9);assert.throws(()=>compareAllInCost(x),/outcome mismatch/);});
test('duplicate receipt rejected',()=>{const x=fixture();x.baseline.receipts.push({...x.baseline.receipts[0]});assert.throws(()=>compareAllInCost(x),/duplicate/);});
test('failed receipt rejected',()=>{const x=fixture();x.candidate.receipts[0].status='failed';assert.throws(()=>compareAllInCost(x),/failed/);});
test('missing cost category rejected',()=>{const x=fixture();delete x.candidate.overhead.otherDataAvailabilityWei;assert.throws(()=>compareAllInCost(x),/overhead/);});
test('negative fee rejected',()=>{const x=fixture();x.candidate.overhead.rpcInfrastructureWei='-1';assert.throws(()=>compareAllInCost(x),/canonical/);});
test('zero baseline rejected',()=>{const x=fixture();x.baseline.receipts[0].gasUsed='0';assert.throws(()=>compareAllInCost(x),/zero baseline/);});
test('exact 45 percent does not exceed threshold',()=>{const x=fixture();x.candidate.receipts[0].gasUsed='55';assert.equal(compareAllInCost(x).modeledAbove45Percent,false);});

test('unattested modeled >45% is never verified',()=>{const x=compareAllInCost(fixture());assert.equal(x.modeledAbove45Percent,true);assert.equal(x.verifiedAbove45Percent,false);});
test('negative modeled savings are never verified',()=>{const x=fixture();x.candidate.overhead.relayerCompensationWei='600';assert.equal(compareAllInCost(x).verifiedAbove45Percent,false);});
