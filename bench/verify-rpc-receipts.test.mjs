import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyMinedReceipts } from './verify-rpc-receipts.mjs';
const id='0x'+'a'.repeat(64), blockHash='0x'+'b'.repeat(64);
const fixture = () => ({
  eth_chainId:'0x1', eth_blockNumber:'0x20',
  eth_getTransactionReceipt:{transactionHash:id,status:'0x1',blockHash,blockNumber:'0x10',gasUsed:'0x5208',effectiveGasPrice:'0x2'},
  eth_getBlockByNumber:{hash:blockHash,number:'0x10'},
  eth_getTransactionByHash:{hash:id,blockHash,blockNumber:'0x10'}
});
const run = (responses, options={}) => verifyMinedReceipts({
  request: async (method) => responses[method], chainId:'1', transactionHashes:[id],
  minConfirmations:12,...options
});
test('canonical confirmed receipt is accepted',async()=>{
  const result=await run(fixture());
  assert.equal(result[0].confirmations,'17');
  assert.equal(result[0].verifiedChainId,'1');
});
test('reject chain mismatch',async()=>{
  const f=fixture(); f.eth_chainId='0x2105';
  await assert.rejects(run(f),/chain mismatch/);
});
test('reject unconfirmed receipts',async()=>{
  const f=fixture(); f.eth_blockNumber='0x10';
  await assert.rejects(run(f),/insufficient confirmations/);
});
test('reject reorged receipt block',async()=>{
  const f=fixture(); f.eth_getBlockByNumber.hash='0x'+'c'.repeat(64);
  await assert.rejects(run(f),/not canonical/);
});
test('reject transaction inclusion mismatch',async()=>{
  const f=fixture(); f.eth_getTransactionByHash.blockHash='0x'+'c'.repeat(64);
  await assert.rejects(run(f),/inclusion mismatch/);
});
test('reject failed receipts and duplicate evidence',async()=>{
  const f=fixture(); f.eth_getTransactionReceipt.status='0x0';
  await assert.rejects(run(f),/incomplete mined receipt/);
  await assert.rejects(run(fixture(),{transactionHashes:[id,id]}),/Duplicate/);
});
