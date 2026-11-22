import test from 'node:test';
import assert from 'node:assert/strict';
import { compareEquivalent, accountPath } from './all-in-cost-gate.mjs';
const hash = '0x' + 'a'.repeat(64);
const recipient = '0x' + '1'.repeat(40);
const outcome = [{recipient, asset:'native', deltaWei:'100'}];
let nextHash = 1n;
const path = (gas, overrides={}) => ({
  chainId:'31337', obligations: 1, outcome, receipts:[{transactionHash:'0x'+(nextHash++).toString(16).padStart(64,'0'),status:'0x1',gasUsed:String(gas),
    effectiveGasPriceWei:'1',dataFeeWei:'0'}],
  relayerFeeWei:'0',authorizationFeeWei:'0',deploymentFeeWei:'0',
  settlementFeeWei:'0',otherFeeWei:'0',...overrides
});
test('identical outcomes and explicit fees yield exact >45% threshold',()=>{
  const result=compareEquivalent(path(100),path(54));
  assert.equal(result.savingsBasisPoints,'4600');
  assert.equal(result.exceeds45Percent,true);
  assert.equal(compareEquivalent(path(100),path(55)).exceeds45Percent,false);
});
test('relayer and settlement costs can erase apparent savings',()=>{
  const result=compareEquivalent(path(100),path(40,{relayerFeeWei:'40',settlementFeeWei:'30'}));
  assert.equal(result.savingsBasisPoints,'-1000');
});
test('missing data fees fail closed',()=>{
  const candidate=path(40); delete candidate.receipts[0].dataFeeWei;
  assert.throws(()=>compareEquivalent(path(100),candidate),/dataFeeWei/);
});
test('recipient and obligation mismatches fail closed',()=>{
  assert.throws(()=>compareEquivalent(path(100),path(40,{outcome:[{recipient:'0x'+'2'.repeat(40),asset:'native',deltaWei:'100'}]})),/Non-equivalent/);
  assert.throws(()=>compareEquivalent(path(100),path(40,{obligations:2})),/Non-equivalent/);
});
test('invalid receipts and duplicated outcomes fail closed',()=>{
  assert.throws(()=>accountPath(path(10,{receipts:[{transactionHash:hash,status:'0x0',gasUsed:'10',effectiveGasPriceWei:'1',dataFeeWei:'0'}]})),/successful/);
  assert.throws(()=>accountPath(path(10,{outcome:[...outcome,...outcome]})),/Duplicate/);
});
test('decimal wei is exact above Number.MAX_SAFE_INTEGER',()=>{
  const r=accountPath(path('9007199254740993'));
  assert.equal(r.totalWei,'9007199254740993');
});

test('same receipt cannot be reused across baseline and candidate',()=>{
  const a=path(100), b=path(40);
  b.receipts[0].transactionHash=a.receipts[0].transactionHash.toUpperCase().replace('0X','0x');
  assert.throws(()=>compareEquivalent(a,b),/reuse the same transaction receipt/);
});
test('duplicate receipt within a path is rejected',()=>{
  const a=path(100);
  a.receipts.push({...a.receipts[0],transactionHash:a.receipts[0].transactionHash.toUpperCase().replace('0X','0x')});
  assert.throws(()=>accountPath(a),/Duplicate transaction receipt/);
});

test('chain ID is mandatory and nonzero',()=>{
  const a=path(100); delete a.chainId;
  assert.throws(()=>accountPath(a),/chainId/);
  assert.throws(()=>accountPath(path(100,{chainId:'0'})),/chainId/);
});
test('identical hash on different chains is not duplicate transaction identity',()=>{
  const a=path(100), b=path(40,{chainId:'31338'});
  b.receipts[0].transactionHash=a.receipts[0].transactionHash;
  assert.equal(compareEquivalent(a,b).savingsBasisPoints,'6000');
});
