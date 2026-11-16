import test from 'node:test';
import assert from 'node:assert/strict';
import {attestReceipts} from './rpc-receipt-evidence.mjs';
const h=n=>'0x'+n.toString(16).padStart(64,'0');
const a=n=>'0x'+n.toString(16).padStart(40,'0');
function fixture(){
 const receipt={transactionHash:h(1),status:'0x1',blockNumber:'0x5',blockHash:h(2),gasUsed:'0x5208',effectiveGasPrice:'0x2',l1Fee:'0x4'};
 const tx={hash:h(1),blockHash:h(2),from:a(1),to:a(2)};
 const block={hash:h(2),number:'0x5'};
 const supplied={transactionHash:h(1),from:a(1),to:a(2),totalFeeWei:'42004',blockHash:h(2)};
 const rpc=async method=>({eth_chainId:'0x7a69',eth_blockNumber:'0x10',eth_getTransactionReceipt:receipt,eth_getBlockByNumber:block,eth_getTransactionByHash:tx})[method];
 return {receipt,tx,block,supplied,rpc};
}
const run=f=>attestReceipts({chainId:'31337',receipts:[f.supplied],rpc:f.rpc});
test('attests receipt, not recipient balances or economic savings',async()=>{const x=await run(fixture());assert.equal(x.receipts[0].totalFeeWei,'42004');assert.equal(x.verifiedRecipientOutcomes,false);assert.equal(x.verifiedEconomicSavings,false)});
test('rejects forged fee',async()=>{const f=fixture();f.supplied.totalFeeWei='0';await assert.rejects(run(f),/fee mismatch/)});
test('rejects chain mismatch',async()=>{const f=fixture();const orig=f.rpc;f.rpc=async(m,p)=>m==='eth_chainId'?'0x1':orig(m,p);await assert.rejects(run(f),/chain mismatch/)});
test('rejects failed transaction',async()=>{const f=fixture();f.receipt.status='0x0';await assert.rejects(run(f),/failed transaction/)});
test('rejects noncanonical block',async()=>{const f=fixture();f.block.hash=h(3);await assert.rejects(run(f),/noncanonical/)});
test('rejects insufficient confirmations',async()=>{const f=fixture();await assert.rejects(attestReceipts({chainId:'31337',receipts:[f.supplied],rpc:f.rpc,minConfirmations:20}),/confirmations/)});
test('rejects transaction inclusion mismatch',async()=>{const f=fixture();f.tx.blockHash=h(3);await assert.rejects(run(f),/inclusion/)});
test('rejects incomplete blob evidence',async()=>{const f=fixture();f.receipt.blobGasUsed='0x1';await assert.rejects(run(f),/blob/)});
test('accounts for blob fees',async()=>{const f=fixture();f.receipt.blobGasUsed='0x2';f.receipt.blobGasPrice='0x3';f.supplied.totalFeeWei='42010';const x=await run(f);assert.equal(x.receipts[0].blobFeeWei,'6')});
test('rejects duplicate hashes',async()=>{const f=fixture();await assert.rejects(attestReceipts({chainId:'31337',receipts:[f.supplied,f.supplied],rpc:f.rpc}),/duplicate/)});
test('rejects invalid quantity',async()=>{const f=fixture();f.receipt.gasUsed='21000';await assert.rejects(run(f),/quantity/)});
