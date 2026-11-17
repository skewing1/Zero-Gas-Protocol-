import test from 'node:test';
import assert from 'node:assert/strict';
import {observeCanonicalReceipt} from './observe-canonical-receipt.mjs';
const h = n => '0x' + n.toString(16).padStart(64, '0');
const tx = h(1), blockHash = h(2);
function fixture() {
  const responses = {
    eth_chainId: '0x2105', eth_blockNumber: '0x20',
    eth_getTransactionReceipt: {transactionHash:tx,blockHash,blockNumber:'0x10',status:'0x1',gasUsed:'0x5208',effectiveGasPrice:'0x3b9aca00'},
    eth_getBlockByNumber: {hash:blockHash,number:'0x10'}
  };
  return {responses, rpc:async method=>responses[method]};
}
const run = rpc => observeCanonicalReceipt({rpc,txHash:tx,expectedChainId:'8453',minConfirmations:12});
test('observes confirmed matching canonical receipt without attesting outcome or full cost',async()=>{
  const {rpc}=fixture(); const result=await run(rpc);
  assert.equal(result.executionFeeWei,'21000000000000');
  assert.equal(result.confirmations,'17');
  assert.equal(result.verifiedSavingsEligible,false);
  assert.equal(result.outcomeVerified,false);
});
test('rejects mismatched chain',async()=>{const f=fixture();f.responses.eth_chainId='0x1';await assert.rejects(run(f.rpc),/chain mismatch/);});
test('rejects reorged block',async()=>{const f=fixture();f.responses.eth_getBlockByNumber.hash=h(3);await assert.rejects(run(f.rpc),/noncanonical/);});
test('rejects pending receipt',async()=>{const f=fixture();f.responses.eth_getTransactionReceipt=null;await assert.rejects(run(f.rpc),/missing receipt/);});
test('rejects failed transaction',async()=>{const f=fixture();f.responses.eth_getTransactionReceipt.status='0x0';await assert.rejects(run(f.rpc),/failed/);});
test('rejects too few confirmations',async()=>{const f=fixture();f.responses.eth_blockNumber='0x12';await assert.rejects(run(f.rpc),/confirmations/);});
test('rejects malformed gas fields',async()=>{const f=fixture();f.responses.eth_getTransactionReceipt.gasUsed='0x00';await assert.rejects(run(f.rpc),/canonical/);});
test('rejects mismatched transaction hash',async()=>{const f=fixture();f.responses.eth_getTransactionReceipt.transactionHash=h(4);await assert.rejects(run(f.rpc),/transaction mismatch/);});
test('rejects mismatched block number',async()=>{const f=fixture();f.responses.eth_getBlockByNumber.number='0x11';await assert.rejects(run(f.rpc),/noncanonical/);});
test('rejects invalid confirmation threshold',async()=>{const f=fixture();await assert.rejects(observeCanonicalReceipt({rpc:f.rpc,txHash:tx,expectedChainId:'8453',minConfirmations:0}),/confirmations/);});
