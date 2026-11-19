import test from 'node:test';
import assert from 'node:assert/strict';
import {compareEvidencedPayments} from './compare-evidenced-payments.mjs';
const h=n=>'0x'+n.toString(16).padStart(64,'0');
const addr='0x'+'a'.repeat(40);
const snapshot=(before,after)=>({chainId:'31337',asset:'native',recipients:[{address:addr,before,after}]});
const capture=(hash,fee)=>({chainId:'31337',verifiedByTool:false,receipts:[{transactionHash:hash,canonical:true,success:true,executionWei:fee,blobWei:'0',dataWei:'0'}]});
const costs=()=>({relayerWei:'0',deploymentWei:'0',settlementWei:'0',bridgeWei:'0'});
const fixture=()=>({baselineCapture:capture(h(1),'100'),candidateCapture:capture(h(2),'50'),baselineCosts:costs(),candidateCosts:costs(),baselineSnapshot:snapshot('10','20'),candidateSnapshot:snapshot('100','110')});
test('reconciles equivalent balance deltas and calculates fees without claiming verified savings',()=>{
 const r=compareEvidencedPayments(fixture());assert.equal(r.savingsBps,'5000');assert.equal(r.recipientDeltaEquivalent,true);assert.equal(r.claimableSavings,false);assert.equal(r.verifiedByTool,false);assert.equal(r.recipientCount,1);
});
test('rejects unequal recipient outcomes',()=>{const a=fixture();a.candidateSnapshot.recipients[0].after='111';assert.throws(()=>compareEvidencedPayments(a),/Different recipient balance deltas/)});
test('rejects capture chain mismatched with balance evidence',()=>{const a=fixture();a.candidateCapture.chainId='8453';assert.throws(()=>compareEvidencedPayments(a),/capture chain differs/i)});
test('rejects duplicate receipt reused by both strategies',()=>{const a=fixture();a.candidateCapture.receipts[0].transactionHash=h(1);assert.throws(()=>compareEvidencedPayments(a),/reused/)});
test('rejects missing relayer cost',()=>{const a=fixture();delete a.candidateCosts.relayerWei;assert.throws(()=>compareEvidencedPayments(a),/relayerWei/)});
test('relayer cost erases apparent savings',()=>{const a=fixture();a.candidateCosts.relayerWei='60';assert.equal(compareEvidencedPayments(a).meetsTarget,false)});
test('rejects invalid snapshot recipient',()=>{const a=fixture();a.baselineSnapshot.recipients[0].address='0xdead';assert.throws(()=>compareEvidencedPayments(a),/EVM address/)});
