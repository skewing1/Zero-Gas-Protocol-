import test from 'node:test';
import assert from 'node:assert/strict';
import {checkReceiptConfirmations} from './receipt-confirmation.mjs';
const h='0x'+'ab'.repeat(32);
const evidence={status:'success',blockNumber:'5',blockHash:h};
const rpc=async(method)=>method==='eth_blockNumber'?'0x10':{hash:h,number:'0x5'};
test('sufficient confirmations are not consensus or savings proof',async()=>{
 const result=await checkReceiptConfirmations(rpc,evidence,12);
 assert.deepEqual(result,{confirmations:'12',canonicalAtCheck:true,consensusAuthenticated:false,verifiedAllIn:false});
});
test('rejects insufficient confirmations',async()=>assert.rejects(checkReceiptConfirmations(rpc,evidence,13),/Insufficient/));
test('rejects reorged canonical block',async()=>assert.rejects(checkReceiptConfirmations(async method=>method==='eth_blockNumber'?'0x10':{hash:'0x'+'cd'.repeat(32),number:'0x5'},evidence),/changed/));
test('rejects latest height behind receipt',async()=>assert.rejects(checkReceiptConfirmations(async()=> '0x4',evidence),/above latest/));
test('rejects invalid threshold',async()=>assert.rejects(checkReceiptConfirmations(rpc,evidence,0),/threshold/));
test('rejects malformed block height',async()=>assert.rejects(checkReceiptConfirmations(async method=>method==='eth_blockNumber'?'16':{hash:h,number:'0x5'},evidence),/canonical RPC/));
test('rejects failed receipt evidence',async()=>assert.rejects(checkReceiptConfirmations(rpc,{...evidence,status:'failed'}),/Successful/));
