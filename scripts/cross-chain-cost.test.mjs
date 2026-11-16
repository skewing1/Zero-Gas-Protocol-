import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePath, comparePaths } from './cross-chain-cost.mjs';
const digest = '0x' + 'ab'.repeat(32);
const base = { chainId:'1', nativeUsd:'2000', quoteTimestamp:'2026-11-16T12:00:00Z', outcomeDigest:digest,
 settlementWei:'1000000000000000', prefundWei:'0', deploymentWei:'0', relayerUsd:'0', dataUsd:'0', proofUsd:'0', bridgeUsd:'0', infrastructureUsd:'0' };
test('one milliether at 2000 USD/ETH costs 2 USD',()=>assert.equal(normalizePath(base).totalMicroUsd,'2000000'));
test('different chain native prices normalized in USD',()=>assert.equal(comparePaths(base,{...base,chainId:'8453',nativeUsd:'1000'}).savingsBps,'5000'));
test('explicit relayer costs reduce apparent savings',()=>assert.equal(comparePaths(base,{...base,settlementWei:'500000000000000',relayerUsd:'0.6'}).savingsBps,'2000'));
test('rejects missing offchain cost evidence',()=>assert.throws(()=>normalizePath({...base,dataUsd:undefined}),/missing dataUsd/));
test('rejects nonidentical outcomes',()=>assert.throws(()=>comparePaths(base,{...base,outcomeDigest:'0x'+'cd'.repeat(32)}),/outcomes differ/));
test('rejects mismatched quote times',()=>assert.throws(()=>comparePaths(base,{...base,quoteTimestamp:'2026-11-16T13:00:00Z'}),/quotes must share timestamp/));
test('rejects zero baseline',()=>assert.throws(()=>comparePaths({...base,settlementWei:'0'},base),/zero baseline/));
test('rejects negative and floating point inputs',()=>{assert.throws(()=>normalizePath({...base,relayerUsd:'-1'}));assert.throws(()=>normalizePath({...base,nativeUsd:1.5}));});
test('ceil rounds microUSD upward',()=>assert.equal(normalizePath({...base,settlementWei:'0',relayerUsd:'0.0000001'}).totalMicroUsd,'1'));
