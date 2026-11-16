import test from 'node:test';
import assert from 'node:assert/strict';
import { compareEconomicScenarios } from './economic-scenarios.mjs';
const rows = [{path:'P0',allInReceiptFeeWei:'200'}, {path:'P1',allInReceiptFeeWei:'100'}];
const costs = (p0='0', p1='0') => ({P0:{relayerWei:p0,dataWei:'0',proofWei:'0',bridgeWei:'0',infrastructureWei:'0'},P1:{relayerWei:p1,dataWei:'0',proofWei:'0',bridgeWei:'0',infrastructureWei:'0'}});
test('50% receipt savings falls to 20% after relayer overhead', () => {
  const r = compareEconomicScenarios(rows,costs('0','60'));
  assert.equal(r[1].savingsBps,'2000');
  assert.equal(r[1].exceeds45PercentScenario,false);
  assert.match(r[1].evidence,/scenario-only/);
});
test('counts all five assumed overhead categories',()=>{
  const c=costs(); c.P1={relayerWei:'1',dataWei:'2',proofWei:'3',bridgeWei:'4',infrastructureWei:'5'};
  assert.equal(compareEconomicScenarios(rows,c)[1].totalWei,'115');
});
test('rejects missing assumptions instead of silently using zero',()=>assert.throws(()=>compareEconomicScenarios(rows,{P0:costs().P0}),/Invalid cost/));
test('rejects unknown cost categories',()=>{const c=costs();c.P1.receipts='0';assert.throws(()=>compareEconomicScenarios(rows,c),/Invalid cost/)});
test('rejects negative and imprecise values',()=>{const c=costs();c.P1.bridgeWei='-1';assert.throws(()=>compareEconomicScenarios(rows,c),/nonnegative/);c.P1.bridgeWei=1;assert.throws(()=>compareEconomicScenarios(rows,c),/nonnegative/)});
test('rejects duplicate paths',()=>assert.throws(()=>compareEconomicScenarios([rows[0],rows[0]],costs()),/Unique/));
test('handles exact huge integers',()=>{const r=compareEconomicScenarios([{path:'P0',allInReceiptFeeWei:'1000000000000000000000000000000000000'},{path:'P1',allInReceiptFeeWei:'500000000000000000000000000000000000'}],costs());assert.equal(r[1].savingsBps,'5000')});
test('rejects zero baseline',()=>assert.throws(()=>compareEconomicScenarios([{path:'P0',allInReceiptFeeWei:'0'},rows[1]],costs()),/Zero baseline/));
