import test from 'node:test';
import assert from 'node:assert/strict';
import {compareAllInCost} from './all-in-cost-ledger.mjs';
const h = digit => '0x' + digit.repeat(64);
const overhead = () => Object.fromEntries(['relayerCompensationWei','rpcInfrastructureWei','proofAndSettlementWei','deploymentAndAuthorizationWei','otherDataAvailabilityWei'].map(k=>[k,'0']));
const side = hash => ({outcomeDigest:h('a'),overhead:overhead(),receipts:[{txHash:hash,status:'success',gasUsed:'21000',effectiveGasPriceWei:'1',additionalL1DataFeeWei:'0',additionalBlobFeeWei:'0'}]});
test('rejects identical receipt counted in both cohorts',()=>assert.throws(()=>compareAllInCost({baseline:side(h('1')),candidate:side(h('1')),verifiedOutcomeDigest:h('a')}),/overlap/));
test('rejects case-insensitive overlapping receipt hash',()=>assert.throws(()=>compareAllInCost({baseline:side(h('b')),candidate:side(h('B')),verifiedOutcomeDigest:h('a')}),/overlap/));
test('accepts distinct receipts without asserting real savings',()=>{const r=compareAllInCost({baseline:side(h('1')),candidate:side(h('2')),verifiedOutcomeDigest:h('a')});assert.equal(r.verifiedAbove45Percent,false);assert.equal(r.savingsBps,'0');});
