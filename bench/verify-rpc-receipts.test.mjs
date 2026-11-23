import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyMinedReceipts } from './verify-rpc-receipts.mjs';
const id='0x'+'a'.repeat(64), blockHash='0x'+'b'.repeat(64);
const fixture = () => ({
  eth_chainId:'0x1', eth_blockNumber:'0x20',
  eth_getTransactionReceipt:{transactionHash:id,status:'0x1',blockHash,blockNumber:'0x10',gasUsed:'0x5208',effectiveGasPrice:'0x2',transactionIndex:'0x0'},
  eth_getBlockByNumber:{hash:blockHash,number:'0x10',transactions:[id]},
  eth_getTransactionByHash:{hash:id,blockHash,blockNumber:'0x10',transactionIndex:'0x0',chainId:'0x1'}
});
const auth = (overrides={}) => ({chainId:'0x1',address:'0x'+'1'.repeat(40),nonce:'0x0',yParity:'0x0',r:'0x1',s:'0x1',...overrides});
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

test('require EIP-7702 rejects legacy transaction',async()=>{
  const f=fixture(); f.eth_getTransactionByHash.type='0x2';
  await assert.rejects(run(f,{requireEip7702:true}),/Expected mined EIP-7702/);
});
test('require EIP-7702 rejects missing authorization list',async()=>{
  const f=fixture(); f.eth_getTransactionByHash.type='0x4';
  await assert.rejects(run(f,{requireEip7702:true}),/Expected mined EIP-7702/);
});
test('require EIP-7702 accepts matching type-4 evidence',async()=>{
  const f=fixture(); f.eth_getTransactionByHash.type='0x4';
  f.eth_getTransactionByHash.authorizationList=[auth()];
  f.eth_getTransactionReceipt.type='0x4';
  assert.equal((await run(f,{requireEip7702:true}))[0].verifiedChainId,'1');
});
test('require EIP-7702 rejects conflicting receipt type',async()=>{
  const f=fixture(); f.eth_getTransactionByHash.type='0x4';
  f.eth_getTransactionByHash.authorizationList=[auth()];
  f.eth_getTransactionReceipt.type='0x2';
  await assert.rejects(run(f,{requireEip7702:true}),/type mismatch/);
});

test('reject authorization for another chain',async()=>{
  const f=fixture(); f.eth_getTransactionByHash.type='0x4';
  f.eth_getTransactionByHash.authorizationList=[auth({chainId:'0x2105'})];
  await assert.rejects(run(f,{requireEip7702:true}),/authorization chain mismatch/);
});
test('reject incomplete authorization tuple',async()=>{
  const f=fixture(); f.eth_getTransactionByHash.type='0x4';
  f.eth_getTransactionByHash.authorizationList=[{chainId:'0x1'}];
  await assert.rejects(run(f,{requireEip7702:true}),/delegate address/);
});
test('reject invalid parity and zero signature scalar',async()=>{
  const f=fixture(); f.eth_getTransactionByHash.type='0x4';
  f.eth_getTransactionByHash.authorizationList=[auth({yParity:'0x2'})];
  await assert.rejects(run(f,{requireEip7702:true}),/yParity/);
  f.eth_getTransactionByHash.authorizationList=[auth({r:'0x0'})];
  await assert.rejects(run(f,{requireEip7702:true}),/signature scalar/);
});
test('allow chain-agnostic EIP-7702 authorization chainId zero',async()=>{
  const f=fixture(); f.eth_getTransactionByHash.type='0x4';
  f.eth_getTransactionByHash.authorizationList=[auth({chainId:'0x0'})];
  f.eth_getTransactionReceipt.type='0x4';
  assert.equal((await run(f,{requireEip7702:true}))[0].verifiedChainId,'1');
});

test('reject receipt absent from canonical block transactions',async()=>{
  const f=fixture(); f.eth_getBlockByNumber.transactions=['0x'+'c'.repeat(64)];
  await assert.rejects(run(f),/not present at canonical block index/);
});
test('reject receipt index beyond canonical block transaction count',async()=>{
  const f=fixture(); f.eth_getTransactionReceipt.transactionIndex='0x1';
  await assert.rejects(run(f),/not present at canonical block index/);
});
test('reject transaction index inconsistent with receipt',async()=>{
  const f=fixture(); f.eth_getTransactionByHash.transactionIndex='0x1';
  await assert.rejects(run(f),/inclusion mismatch/);
});
test('reject missing canonical block transaction list',async()=>{
  const f=fixture(); delete f.eth_getBlockByNumber.transactions;
  await assert.rejects(run(f),/not present at canonical block index/);
});

test('reject type-4 transaction on a different execution chain',async()=>{
  const f=fixture(); f.eth_getTransactionByHash.type='0x4';
  f.eth_getTransactionByHash.authorizationList=[auth()];
  f.eth_getTransactionByHash.chainId='0xa4b1';
  await assert.rejects(run(f,{requireEip7702:true}),/Expected mined EIP-7702/);
});
test('reject type-4 transaction without explicit execution chainId',async()=>{
  const f=fixture(); f.eth_getTransactionByHash.type='0x4';
  f.eth_getTransactionByHash.authorizationList=[auth()];
  delete f.eth_getTransactionByHash.chainId;
  await assert.rejects(run(f,{requireEip7702:true}),/Invalid RPC quantity: transaction.chainId/);
});

test('reject reorganization occurring between initial and final block checks', async () => {
  const f = fixture();
  let reads = 0;
  await assert.rejects(verifyMinedReceipts({
    chainId:'1', transactionHashes:[id], minConfirmations:12,
    request:async (method) => {
      if (method === 'eth_getBlockByNumber' && ++reads === 2)
        return {...f.eth_getBlockByNumber,hash:'0x'+'c'.repeat(64)};
      return f[method];
    }
  }), /reorganized during verification/);
});
test('reject confirmation loss occurring during verification', async () => {
  const f = fixture();
  let reads = 0;
  await assert.rejects(verifyMinedReceipts({
    chainId:'1', transactionHashes:[id], minConfirmations:12,
    request:async (method) => {
      if (method === 'eth_blockNumber' && ++reads === 2) return '0x10';
      return f[method];
    }
  }), /lost confirmations during verification/);
});

test('reject RPC chain switch after finality checks', async () => {
  const f = fixture();
  let chainReads = 0;
  await assert.rejects(verifyMinedReceipts({
    chainId:'1', transactionHashes:[id], minConfirmations:12,
    request:async (method) => {
      if (method === 'eth_chainId' && ++chainReads === 2) return '0x2105';
      return f[method];
    }
  }), /RPC chain changed during verification/);
});

test('reject receipt execution gas changing during final verification', async () => {
  const f = fixture();
  let receiptReads = 0;
  await assert.rejects(verifyMinedReceipts({
    chainId:'1', transactionHashes:[id], minConfirmations:12,
    request:async (method) => {
      if (method === 'eth_getTransactionReceipt' && ++receiptReads === 2)
        return {...f.eth_getTransactionReceipt,gasUsed:'0x5209'};
      return f[method];
    }
  }), /Receipt changed during final verification/);
});
test('reject receipt disappearing during final verification', async () => {
  const f = fixture();
  let receiptReads = 0;
  await assert.rejects(verifyMinedReceipts({
    chainId:'1', transactionHashes:[id], minConfirmations:12,
    request:async (method) => {
      if (method === 'eth_getTransactionReceipt' && ++receiptReads === 2) return null;
      return f[method];
    }
  }), /Receipt changed during final verification/);
});

test('reject Base l1Fee drift during final receipt recheck', async () => {
  const f = fixture(); f.eth_getTransactionReceipt.l1Fee = '0x10';
  let reads = 0;
  await assert.rejects(verifyMinedReceipts({
    chainId:'1', transactionHashes:[id], minConfirmations:12,
    request: async (method) => method === 'eth_getTransactionReceipt' && ++reads === 2
      ? {...f.eth_getTransactionReceipt, l1Fee:'0x11'} : f[method]
  }), /Receipt changed during final verification/);
});
test('reject Base l1Fee disappearing during final receipt recheck', async () => {
  const f = fixture(); f.eth_getTransactionReceipt.l1Fee = '0x10';
  let reads = 0;
  await assert.rejects(verifyMinedReceipts({
    chainId:'1', transactionHashes:[id], minConfirmations:12,
    request: async (method) => method === 'eth_getTransactionReceipt' && ++reads === 2
      ? {...f.eth_getTransactionReceipt, l1Fee:undefined} : f[method]
  }), /Receipt changed during final verification/);
});
test('reject Arbitrum gasUsedForL1 drift during final receipt recheck', async () => {
  const f = fixture(); f.eth_getTransactionReceipt.gasUsedForL1 = '0x10';
  let reads = 0;
  await assert.rejects(verifyMinedReceipts({
    chainId:'1', transactionHashes:[id], minConfirmations:12,
    request: async (method) => method === 'eth_getTransactionReceipt' && ++reads === 2
      ? {...f.eth_getTransactionReceipt, gasUsedForL1:'0x11'} : f[method]
  }), /Receipt changed during final verification/);
});
test('accept unchanged rollup fee evidence on final receipt recheck', async () => {
  const f = fixture(); f.eth_getTransactionReceipt.l1Fee = '0x10';
  assert.equal((await run(f))[0].confirmations, '17');
});
