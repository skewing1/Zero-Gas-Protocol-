import test from 'node:test';
import assert from 'node:assert/strict';
import {compareWindowBoundPayments} from './receipt-snapshot-window.mjs';
const h=n=>'0x'+n.toString(16).padStart(64,'0');
const a='0x'+'a'.repeat(40);
function fixture(){
 const window={beforeBlockNumber:'10',beforeBlockHash:h(10),afterBlockNumber:'12',afterBlockHash:h(12)};
 const capture=(tx)=>({chainId:'31337',verifiedByTool:false,receipts:[{transactionHash:h(tx),blockNumber:'12',blockHash:h(12),canonical:true,success:true,executionWei:'100',blobWei:'0',dataWei:'0'}]});
 const snapshot=(before)=>({chainId:'31337',asset:'native',recipients:[{address:a,before,after:(BigInt(before)+10n).toString()}]});
 const costs={relayerWei:'0',deploymentWei:'0',settlementWei:'0',bridgeWei:'0'};
 return {baselineCapture:capture(1),candidateCapture:capture(2),baselineWindow:{...window},candidateWindow:{...window},baselineSnapshot:snapshot('0'),candidateSnapshot:snapshot('100'),baselineCosts:{...costs},candidateCosts:{...costs}};
}
test('accepts consistent supplied windows without claiming verification',()=>{
 const r=compareWindowBoundPayments(fixture());
 assert.equal(r.windowConsistencyChecked,true);assert.equal(r.claimableSavings,false);
});
test('rejects receipt mined before balance baseline',()=>{
 const x=fixture();x.candidateCapture.receipts[0].blockNumber='10';
 assert.throws(()=>compareWindowBoundPayments(x),/outside snapshot window/);
});
test('rejects receipt mined after balance followup',()=>{
 const x=fixture();x.baselineCapture.receipts[0].blockNumber='13';
 assert.throws(()=>compareWindowBoundPayments(x),/outside snapshot window/);
});
test('rejects contradictory hash at followup block',()=>{
 const x=fixture();x.baselineCapture.receipts[0].blockHash=h(11);
 assert.throws(()=>compareWindowBoundPayments(x),/after-block hash/);
});
test('rejects missing snapshot block metadata',()=>{
 const x=fixture();delete x.baselineWindow.beforeBlockHash;
 assert.throws(()=>compareWindowBoundPayments(x),/beforeBlockHash/);
});
test('rejects malformed receipt block number',()=>{
 const x=fixture();x.candidateCapture.receipts[0].blockNumber='0x0c';
 assert.throws(()=>compareWindowBoundPayments(x),/canonical decimal/);
});
test('rejects duplicated receipts',()=>{
 const x=fixture();x.candidateCapture.receipts.push({...x.candidateCapture.receipts[0]});
 assert.throws(()=>compareWindowBoundPayments(x),/duplicate receipt/);
});
