import test from 'node:test';
import assert from 'node:assert/strict';
import {auditReceiptConfirmations} from './rpc-receipt-confirmations.mjs';
const h=n=>'0x'+n.toString(16).padStart(64,'0');
function fixture(){
 const hash=h(1),blockHash=h(2);
 const data={
 eth_chainId:'0x7a69',
 eth_getTransactionReceipt:{transactionHash:hash,blockHash,blockNumber:'0xa',transactionIndex:'0x0',status:'0x1',gasUsed:'0x5208',effectiveGasPrice:'0x2'},
 eth_getTransactionByHash:{hash,blockHash,blockNumber:'0xa',transactionIndex:'0x0'},
 eth_getBlockByHash:{hash:blockHash,number:'0xa',transactions:[hash]},
 eth_getBlockByNumber:{hash:blockHash,number:'0xa'},
 eth_blockNumber:'0x15'
 };
 return {data,expected:{transactionHash:hash,chainId:'0x7a69'},rpc:async method=>({jsonrpc:'2.0',id:1,result:data[method]})};
}
test('accepts twelve observed confirmations but never claims finality',async()=>{
 const f=fixture(),result=await auditReceiptConfirmations(f.rpc,f.expected);
 assert.equal(result.observedConfirmations,'12');
 assert.equal(result.confirmationDepthPassed,true);
 assert.equal(result.finalityVerified,false);
 assert.equal(result.independentlyVerified,false);
});
test('rejects insufficient confirmations',async()=>{
 const f=fixture();f.data.eth_blockNumber='0x14';
 await assert.rejects(auditReceiptConfirmations(f.rpc,f.expected),/Insufficient confirmations/);
});
test('rejects receipt height above head',async()=>{
 const f=fixture();f.data.eth_blockNumber='0x9';
 await assert.rejects(auditReceiptConfirmations(f.rpc,f.expected),/above chain head/);
});
test('rejects canonical change after depth check',async()=>{
 const f=fixture();let reads=0;const original=f.rpc;
 f.rpc=async(method,params)=>{
  if(method==='eth_getBlockByNumber'&&++reads===3)return {result:{hash:h(3),number:'0xa'}};
  return original(method,params);
 };
 await assert.rejects(auditReceiptConfirmations(f.rpc,f.expected),/Canonical block changed/);
});
test('rejects regressing head',async()=>{
 const f=fixture();let reads=0;const original=f.rpc;
 f.rpc=async(method,params)=>{
  if(method==='eth_blockNumber'&&++reads===2)return {result:'0x14'};
  return original(method,params);
 };
 await assert.rejects(auditReceiptConfirmations(f.rpc,f.expected),/head regressed/);
});
for(const bad of [0,-1,1.5,Number.MAX_SAFE_INTEGER+1])
 test('rejects invalid confirmation threshold '+bad,async()=>{
  const f=fixture();await assert.rejects(auditReceiptConfirmations(f.rpc,f.expected,{minimumConfirmations:bad}),/Invalid minimum/);
 });
