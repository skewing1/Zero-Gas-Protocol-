import test from 'node:test';
import assert from 'node:assert/strict';
import {corroborateReceipt} from './corroborate-receipt.mjs';
const hash = n => '0x' + n.toString(16).padStart(64, '0');
const txHash=hash(1), blockHash=hash(2);
function endpoint(overrides={}) {
  const responses={
    eth_chainId:'0x2105', eth_blockNumber:'0x20',
    eth_getTransactionReceipt:{transactionHash:txHash,blockHash,blockNumber:'0x10',status:'0x1',gasUsed:'0x5208',effectiveGasPrice:'0x3b9aca00'},
    eth_getBlockByNumber:{hash:blockHash,number:'0x10'}
  };
  Object.assign(responses,overrides);
  return async method=>responses[method];
}
const args=(rpcA,rpcB)=>({rpcA,rpcB,txHash,expectedChainId:'8453',minConfirmations:12});
test('matching endpoints corroborate execution fees without claiming verified savings',async()=>{
  const result=await corroborateReceipt(args(endpoint(),endpoint()));
  assert.equal(result.executionFeeWei,'21000000000000');
  assert.equal(result.minimumObservedConfirmations,'17');
  assert.equal(result.verifiedSavingsEligible,false);
  assert.equal(result.fullCostVerified,false);
});
test('rejects same transport function',async()=>{
  const rpc=endpoint();await assert.rejects(corroborateReceipt(args(rpc,rpc)),/distinct/);
});
test('rejects mismatched block hashes',async()=>{
  const rpcB=endpoint({eth_getTransactionReceipt:{transactionHash:txHash,blockHash:hash(3),blockNumber:'0x10',status:'0x1',gasUsed:'0x5208',effectiveGasPrice:'0x3b9aca00'},eth_getBlockByNumber:{hash:hash(3),number:'0x10'}});
  await assert.rejects(corroborateReceipt(args(endpoint(),rpcB)),/RPC disagreement: blockHash/);
});
test('rejects disagreement on charged gas',async()=>{
  const rpcB=endpoint({eth_getTransactionReceipt:{transactionHash:txHash,blockHash,blockNumber:'0x10',status:'0x1',gasUsed:'0x5209',effectiveGasPrice:'0x3b9aca00'}});
  await assert.rejects(corroborateReceipt(args(endpoint(),rpcB)),/RPC disagreement: gasUsed/);
});
test('rejects a failed endpoint',async()=>{
  await assert.rejects(corroborateReceipt(args(endpoint(),endpoint({eth_getTransactionReceipt:null})),/missing receipt/);
});
test('uses lower confirmation count',async()=>{
  const result=await corroborateReceipt(args(endpoint(),endpoint({eth_blockNumber:'0x1b'})));
  assert.equal(result.minimumObservedConfirmations,'12');
});
test('rejects insufficient confirmations from either endpoint',async()=>{
  await assert.rejects(corroborateReceipt(args(endpoint(),endpoint({eth_blockNumber:'0x1a'}))),/insufficient confirmations/);
});
test('rejects different chains',async()=>{
  await assert.rejects(corroborateReceipt(args(endpoint(),endpoint({eth_chainId:'0x1'}))),/chain mismatch/);
});
