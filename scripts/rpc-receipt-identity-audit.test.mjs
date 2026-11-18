import test from 'node:test';
import assert from 'node:assert/strict';
import { auditReceiptIdentity } from './rpc-receipt-identity-audit.mjs';
const h = n => '0x' + n.toString(16).padStart(64,'0');
function fixture() {
  const hash=h(1), blockHash=h(2);
  const responses={
    eth_chainId:'0x7a69',
    eth_getTransactionReceipt:{transactionHash:hash,blockHash,blockNumber:'0xa',transactionIndex:'0x0',status:'0x1',gasUsed:'0x5208',effectiveGasPrice:'0x2'},
    eth_getTransactionByHash:{hash,blockHash,blockNumber:'0xa',transactionIndex:'0x0'},
    eth_getBlockByHash:{hash:blockHash,number:'0xa',transactions:[hash]},
    eth_getBlockByNumber:{hash:blockHash,number:'0xa'}
  };
  return {responses,expected:{transactionHash:hash,chainId:'0x7a69'},rpc:async method=>({jsonrpc:'2.0',id:1,result:responses[method]})};
}
test('reconciles receipt, transaction, inclusion and canonical block',async()=>{
  const f=fixture();const result=await auditReceiptIdentity(f.rpc,f.expected);
  assert.equal(result.executionFeeWei,'42000');
  assert.equal(result.identityChecksPassed,true);
  assert.equal(result.independentlyVerified,false);
  assert.equal(result.outcomeVerified,false);
  assert.equal(result.costCoverageVerified,false);
});
for (const [name, mutate] of [
  ['chain mismatch',f=>f.responses.eth_chainId='0x1'],
  ['failed receipt',f=>f.responses.eth_getTransactionReceipt.status='0x0'],
  ['transaction hash mismatch',f=>f.responses.eth_getTransactionByHash.hash=h(3)],
  ['transaction block mismatch',f=>f.responses.eth_getTransactionByHash.blockHash=h(3)],
  ['transaction index mismatch',f=>f.responses.eth_getTransactionByHash.transactionIndex='0x1'],
  ['block inclusion mismatch',f=>f.responses.eth_getBlockByHash.transactions=[h(4)]],
  ['reorganized block',f=>f.responses.eth_getBlockByNumber.hash=h(4)],
  ['missing fee',f=>delete f.responses.eth_getTransactionReceipt.effectiveGasPrice],
  ['RPC error',f=>f.rpc=async()=>({error:{message:'offline'}})],
  ['missing block transactions',f=>delete f.responses.eth_getBlockByHash.transactions],
]) test('rejects '+name,async()=>{const f=fixture();mutate(f);await assert.rejects(auditReceiptIdentity(f.rpc,f.expected));});
