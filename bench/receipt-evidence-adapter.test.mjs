import test from 'node:test';
import assert from 'node:assert/strict';
import { withReceiptFeeEvidence, compareReceiptEvidence } from './receipt-evidence-adapter.mjs';
const recipient = '0x' + '1'.repeat(40);
const hash = (n) => '0x' + n.toString(16).padStart(64,'0');
function path(chainId, n, gas, extra={}) {
 return { chainId, obligations: 1, outcome:[{recipient,asset:'native',deltaWei:'100'}],
 receipts:[{transactionHash:hash(n),status:'0x1',gasUsed:String(gas),effectiveGasPrice:'2',...extra}],
 relayerFeeWei:'0',authorizationFeeWei:'0',deploymentFeeWei:'0',settlementFeeWei:'0',otherFeeWei:'0' };
}
test('Ethereum baseline and candidate compare with exact arithmetic',()=>{
 const result=compareReceiptEvidence(path('1',1,100),path('1',2,50));
 assert.equal(result.savingsBasisPoints,'5000');
 assert.equal(result.exceeds45Percent,true);
});
test('Base separate l1Fee included in total and defeats apparent savings',()=>{
 const result=compareReceiptEvidence(path('8453',1,100,{l1Fee:'0'}),path('8453',2,50,{l1Fee:'50'}));
 assert.equal(result.candidate.totalWei,'150');
 assert.equal(result.savingsBasisPoints,'2500');
});
test('Arbitrum embedded L1 gas never counted twice',()=>{
 const result=compareReceiptEvidence(path('42161',1,100,{gasUsedForL1:'30'}),path('42161',2,50,{gasUsedForL1:'20'}));
 assert.equal(result.candidate.totalWei,'100');
});
test('reject caller-supplied data fee overrides',()=>assert.throws(()=>withReceiptFeeEvidence(path('1',1,100,{dataFeeWei:'0'})),/Pre-populated/));
test('reject missing Base evidence',()=>assert.throws(()=>withReceiptFeeEvidence(path('8453',1,100)),/requires l1Fee/));
test('reject cross-chain comparison',()=>assert.throws(()=>compareReceiptEvidence(path('1',1,100),path('8453',2,100,{l1Fee:'0'})),/Cross-chain/));
test('reject reused receipt',()=>assert.throws(()=>compareReceiptEvidence(path('1',1,100),path('1',1,50)),/reuse/));
test('reject non-equivalent recipient outcome',()=>{const a=path('1',1,100),b=path('1',2,50);b.outcome[0].deltaWei='101';assert.throws(()=>compareReceiptEvidence(a,b),/Non-equivalent/)});
