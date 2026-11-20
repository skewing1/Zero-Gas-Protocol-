import test from 'node:test';
import assert from 'node:assert/strict';
import {captureReceiptCosts} from './receipt-cost-evidence.mjs';
const H='0x'+'a'.repeat(64),B='0x'+'b'.repeat(64);
function mock({chain='0x14a34',receipt={},tx={},block={}}={}){
 const r={transactionHash:H,blockHash:B,blockNumber:'0x10',transactionIndex:'0x0',status:'0x1',gasUsed:'0x5208',effectiveGasPrice:'0x3',l1Fee:'0x7',...receipt};
 const t={hash:H,blockHash:B,blockNumber:'0x10',transactionIndex:'0x0',...tx};
 const b={hash:B,number:'0x10',transactions:[H],...block};
 return async method=>({eth_chainId:chain,eth_getTransactionReceipt:r,eth_getTransactionByHash:t,eth_getBlockByNumber:b})[method];
}
test('captures mined execution and L1 fee in wei',async()=>{
 const x=await captureReceiptCosts({rpc:mock(),transactionHashes:[H]});
 assert.equal(x.receipts[0].executionWei,'63000');assert.equal(x.receipts[0].dataWei,'7');assert.equal(x.verifiedByTool,false);
});
test('fails closed if L2 data fee unavailable',async()=>{await assert.rejects(captureReceiptCosts({rpc:mock({receipt:{l1Fee:undefined}}),transactionHashes:[H]}),/l1Fee/)});
test('rejects receipt not in canonical transaction position',async()=>{await assert.rejects(captureReceiptCosts({rpc:mock({block:{transactions:['0x'+'c'.repeat(64)]}}),transactionHashes:[H]}),/position/)});
test('rejects reorged block',async()=>{await assert.rejects(captureReceiptCosts({rpc:mock({block:{hash:'0x'+'c'.repeat(64)}}),transactionHashes:[H]}),/Noncanonical/)});
test('rejects reverted transaction',async()=>{await assert.rejects(captureReceiptCosts({rpc:mock({receipt:{status:'0x0'}}),transactionHashes:[H]}),/failed/)});
test('rejects duplicate transaction evidence',async()=>{await assert.rejects(captureReceiptCosts({rpc:mock(),transactionHashes:[H,H.toUpperCase().replace('0X','0x')]}),/Duplicate/)});
test('local data fee exemption restricted to local chains',async()=>{
 await assert.rejects(captureReceiptCosts({rpc:mock(),transactionHashes:[H],dataFeeMode:'zero-local'}),/local/);
 const x=await captureReceiptCosts({rpc:mock({chain:'0x7a69',receipt:{l1Fee:undefined}}),transactionHashes:[H],dataFeeMode:'zero-local'});
 assert.equal(x.receipts[0].dataWei,'0');
});
test('charges blob gas when present',async()=>{const x=await captureReceiptCosts({rpc:mock({receipt:{blobGasUsed:'0x2',blobGasPrice:'0x5'}}),transactionHashes:[H]});assert.equal(x.receipts[0].blobWei,'10')});
test('rejects negative or malformed fee fields',async()=>{await assert.rejects(captureReceiptCosts({rpc:mock({receipt:{l1Fee:'-1'}}),transactionHashes:[H]}),/l1Fee/)});

test('rejects transaction chain ID inconsistent with RPC',async()=>{await assert.rejects(captureReceiptCosts({rpc:mock({tx:{chainId:'0x1'}}),transactionHashes:[H]}),/chain mismatch/)});
test('accepts matching transaction chain ID',async()=>{const x=await captureReceiptCosts({rpc:mock({tx:{chainId:'0x14a34'}}),transactionHashes:[H]});assert.equal(x.receipts.length,1)});
test('rejects receipt gas exceeding transaction limit',async()=>{await assert.rejects(captureReceiptCosts({rpc:mock({tx:{gas:'0x5207'}}),transactionHashes:[H]}),/exceeds transaction gas limit/)});
test('accepts receipt gas within transaction limit',async()=>{const x=await captureReceiptCosts({rpc:mock({tx:{gas:'0x5208'}}),transactionHashes:[H]});assert.equal(x.receipts[0].executionWei,'63000')});
test('rejects inconsistent receipt transaction type',async()=>{await assert.rejects(captureReceiptCosts({rpc:mock({tx:{type:'0x4'},receipt:{type:'0x2'}}),transactionHashes:[H]}),/type mismatch/)});
test('accepts matching type-4 receipt and transaction',async()=>{const x=await captureReceiptCosts({rpc:mock({tx:{type:'0x4'},receipt:{type:'0x4'}}),transactionHashes:[H]});assert.equal(x.receipts.length,1)});

test('rejects silently waived nonzero L1 data fees on local chains',async()=>{
 await assert.rejects(captureReceiptCosts({rpc:mock({chain:'0x7a69'}),transactionHashes:[H],dataFeeMode:'zero-local'}),/Nonzero local L1 fee/);
});
test('accepts explicitly zero local L1 fee',async()=>{
 const x=await captureReceiptCosts({rpc:mock({chain:'0x7a69',receipt:{l1Fee:'0x0'}}),transactionHashes:[H],dataFeeMode:'zero-local'});
 assert.equal(x.receipts[0].dataWei,'0');
});
test('rejects malformed local L1 fee instead of ignoring it',async()=>{
 await assert.rejects(captureReceiptCosts({rpc:mock({chain:'0x7a69',receipt:{l1Fee:'-1'}}),transactionHashes:[H],dataFeeMode:'zero-local'}),/local l1Fee/);
});

test('requires explicit confirmation depth when requested',async()=>{
 const rpc=async(method)=>method==='eth_blockNumber'?'0x10':mock()(method);
 await assert.rejects(captureReceiptCosts({rpc,transactionHashes:[H],minimumConfirmations:'2'}),/insufficient receipt confirmations/);
});
test('accepts confirmed canonical receipt without claiming finality',async()=>{
 const rpc=async(method,params)=>method==='eth_blockNumber'?'0x11':method==='eth_getBlockByNumber'&&params[0]==='0x11'?{hash:'0x'+'d'.repeat(64),number:'0x11'}:mock()(method);
 const x=await captureReceiptCosts({rpc,transactionHashes:[H],minimumConfirmations:'2'});
 assert.equal(x.confirmationEvidence[0].observedConfirmations,'2');
 assert.equal(x.verifiedByTool,false);
});
test('rejects post-head block replacement',async()=>{
 let blockReads=0;
 const rpc=async(method,params)=>{
  if(method==='eth_blockNumber')return '0x11';
  if(method==='eth_getBlockByNumber'&&params[0]==='0x11')return {hash:'0x'+'d'.repeat(64),number:'0x11'};
  if(method==='eth_getBlockByNumber'&&++blockReads===3)return {hash:'0x'+'c'.repeat(64),number:'0x10',transactions:[H]};
  return mock()(method);
 };
 await assert.rejects(captureReceiptCosts({rpc,transactionHashes:[H],minimumConfirmations:'2'}),/Reorg after confirmation check/);
});

test('rejects confirmation head replacement at same height',async()=>{
 let headReads=0;
 const rpc=async(method,params)=>{
  if(method==='eth_blockNumber')return '0x11';
  if(method==='eth_getBlockByNumber'&&params[0]==='0x11')return {number:'0x11',hash:'0x'+(++headReads===1?'d':'e').repeat(64)};
  return mock()(method);
 };
 await assert.rejects(captureReceiptCosts({rpc,transactionHashes:[H],minimumConfirmations:'2'}),/Confirmation head replaced/);
});
test('rejects head height regression after confirmation capture',async()=>{
 let reads=0;
 const rpc=async(method,params)=>{
  if(method==='eth_blockNumber')return ++reads===1?'0x11':'0x10';
  if(method==='eth_getBlockByNumber'&&params[0]==='0x11')return {number:'0x11',hash:'0x'+'d'.repeat(64)};
  return mock()(method);
 };
 await assert.rejects(captureReceiptCosts({rpc,transactionHashes:[H],minimumConfirmations:'2'}),/Confirmation head regressed/);
});
test('accepts advancing head with pinned original canonical head',async()=>{
 let reads=0;
 const rpc=async(method,params)=>{
  if(method==='eth_blockNumber')return ++reads===1?'0x11':'0x12';
  if(method==='eth_getBlockByNumber'&&params[0]==='0x11')return {number:'0x11',hash:'0x'+'d'.repeat(64)};
  return mock()(method);
 };
 const x=await captureReceiptCosts({rpc,transactionHashes:[H],minimumConfirmations:'2'});
 assert.equal(x.confirmationEvidence[0].observedConfirmations,'2');
});
test('rejects RPC chain switch during confirmation',async()=>{
 let reads=0;
 const rpc=async(method,params)=>{
  if(method==='eth_chainId')return ++reads===3?'0x1':'0x14a34';
  if(method==='eth_blockNumber')return '0x11';
  if(method==='eth_getBlockByNumber'&&params[0]==='0x11')return {number:'0x11',hash:'0x'+'d'.repeat(64)};
  return mock()(method);
 };
 await assert.rejects(captureReceiptCosts({rpc,transactionHashes:[H],minimumConfirmations:'2'}),/RPC chain changed after confirmation/);
});
