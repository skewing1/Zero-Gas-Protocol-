import test from 'node:test';
import assert from 'node:assert/strict';
import {checkReceiptConfirmations} from './receipt-confirmation.mjs';
const h = '0x' + 'ab'.repeat(32);
const changed = '0x' + 'cd'.repeat(32);
const evidence = {status:'success',blockNumber:'5',blockHash:h};
test('stable block remains observed canonical but not authenticated', async () => {
  let reads = 0;
  const rpc = async method => method === 'eth_blockNumber' ? '0x10' : (reads++, {hash:h,number:'0x5'});
  assert.deepEqual(await checkReceiptConfirmations(rpc,evidence),{confirmations:'12',canonicalAtCheck:true,consensusAuthenticated:false,verifiedAllIn:false});
  assert.equal(reads,2);
});
test('same-height reorg between tip read and second canonical lookup is rejected',async()=>{
  let reads=0;
  const rpc=async method=>method==='eth_blockNumber'?'0x10':{hash:++reads===1?h:changed,number:'0x5'};
  await assert.rejects(checkReceiptConfirmations(rpc,evidence),/Canonical block changed/);
});
test('second canonical lookup missing block is rejected',async()=>{
  let reads=0;
  const rpc=async method=>method==='eth_blockNumber'?'0x10':(++reads===1?{hash:h,number:'0x5'}:null);
  await assert.rejects(checkReceiptConfirmations(rpc,evidence),/Canonical block changed/);
});
test('second canonical lookup changed height is rejected',async()=>{
  let reads=0;
  const rpc=async method=>method==='eth_blockNumber'?'0x10':{hash:h,number:++reads===1?'0x5':'0x6'};
  await assert.rejects(checkReceiptConfirmations(rpc,evidence),/Canonical block changed/);
});
