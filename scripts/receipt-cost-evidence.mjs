#!/usr/bin/env node
// Read-only mined receipt cost capture; no signing or broadcasts.
import assert from 'node:assert/strict';
import {enforceReceiptConfirmations} from './receipt-confirmation-policy.mjs';
const hash=(v,label)=>{assert(typeof v==='string'&&/^0x[0-9a-fA-F]{64}$/.test(v),'Invalid '+label);return v.toLowerCase()};
const qty=(v,label)=>{assert(typeof v==='string'&&/^0x(?:0|[1-9a-fA-F][0-9a-fA-F]*)$/.test(v),'Invalid '+label);return BigInt(v)};
export async function captureReceiptCosts({rpc,transactionHashes,dataFeeMode='receipt',minimumConfirmations=null}){
 assert(typeof rpc==='function','RPC required');
 assert(Array.isArray(transactionHashes)&&transactionHashes.length>0,'Transaction hashes required');
 assert(['receipt','zero-local'].includes(dataFeeMode),'Invalid data fee mode');
 const chainId=qty(await rpc('eth_chainId',[]),'chainId');
 assert(chainId>0n,'Zero chainId');
 if(dataFeeMode==='zero-local')assert([31337n,31338n].includes(chainId),'Zero data fee only allowed on local test chains');
 const seen=new Set(),evidence=[];
 for(const input of transactionHashes){
  const transactionHash=hash(input,'transaction hash');
  assert(!seen.has(transactionHash),'Duplicate transaction hash');seen.add(transactionHash);
  const [receipt,tx]=await Promise.all([rpc('eth_getTransactionReceipt',[transactionHash]),rpc('eth_getTransactionByHash',[transactionHash])]);
  assert(receipt&&tx,'Missing mined transaction or receipt');
  assert(hash(receipt.transactionHash,'receipt transaction hash')===transactionHash,'Receipt transaction mismatch');
  assert(hash(tx.hash,'transaction hash')===transactionHash,'Transaction mismatch');
  assert(qty(receipt.status,'status')===1n,'Transaction failed');
  if(tx.chainId!=null)assert(qty(tx.chainId,'transaction chainId')===chainId,'Transaction chain mismatch');
  if(tx.type!=null&&receipt.type!=null)assert(qty(tx.type,'transaction type')===qty(receipt.type,'receipt type'),'Transaction type mismatch');
  const blockHash=hash(receipt.blockHash,'receipt block hash');
  const height=qty(receipt.blockNumber,'receipt block number');
  if(tx.blockHash!=null)assert(hash(tx.blockHash,'transaction block hash')===blockHash,'Transaction block mismatch');
  if(tx.blockNumber!=null)assert(qty(tx.blockNumber,'transaction block number')===height,'Transaction height mismatch');
  const block=await rpc('eth_getBlockByNumber',['0x'+height.toString(16),false]);
  assert(block&&hash(block.hash,'canonical block hash')===blockHash&&qty(block.number,'canonical height')===height,'Noncanonical receipt block');
  assert(Array.isArray(block.transactions),'Missing canonical transaction list');
  const index=qty(receipt.transactionIndex,'transaction index');
  assert(index<BigInt(block.transactions.length)&&hash(block.transactions[Number(index)],'canonical transaction')===transactionHash,'Receipt transaction position mismatch');
  if(tx.transactionIndex!=null)assert(qty(tx.transactionIndex,'transaction index')===index,'Transaction index mismatch');
  const gasUsed=qty(receipt.gasUsed,'gasUsed');
  if(tx.gas!=null)assert(gasUsed<=qty(tx.gas,'transaction gas limit'),'Receipt gas exceeds transaction gas limit');
  const executionWei=gasUsed*qty(receipt.effectiveGasPrice,'effectiveGasPrice');
  const blobUsed=receipt.blobGasUsed==null?0n:qty(receipt.blobGasUsed,'blobGasUsed');
  const blobWei=blobUsed===0n?0n:blobUsed*qty(receipt.blobGasPrice,'blobGasPrice');
  // Never silently discard an explicit nonzero L1 fee, even on a local chain.
  // The zero-local exemption means no L1 data charge, not an unpriced charge.
  if(dataFeeMode==='zero-local'&&receipt.l1Fee!=null)assert(qty(receipt.l1Fee,'local l1Fee')===0n,'Nonzero local L1 fee cannot be waived');
  const dataWei=dataFeeMode==='zero-local'?0n:qty(receipt.l1Fee,'l1Fee (required for receipt data fee mode)');
  evidence.push({transactionHash,blockHash,blockNumber:height.toString(),transactionIndex:index.toString(),executionWei:executionWei.toString(),blobWei:blobWei.toString(),dataWei:dataWei.toString(),canonical:true,success:true});
 }
 assert(qty(await rpc('eth_chainId',[]),'final chainId')===chainId,'RPC chain changed');
 for(const e of evidence){
  const b=await rpc('eth_getBlockByNumber',['0x'+BigInt(e.blockNumber).toString(16),false]);
  assert(b&&hash(b.hash,'rechecked block hash')===e.blockHash,'Reorg after receipt capture');
 }
 // An explicit depth requirement prevents reporting shallow receipts as sufficiently confirmed.
 // Depth is chain-relative and does not constitute economic finality.
 let confirmationEvidence=null;
 if(minimumConfirmations!==null){
  assert(typeof minimumConfirmations==='string','minimumConfirmations must be a canonical decimal string');
  const head=qty(await rpc('eth_blockNumber',[]),'chain head');
  confirmationEvidence=evidence.map(e=>({transactionHash:e.transactionHash,...enforceReceiptConfirmations({receiptBlockNumber:e.blockNumber,headBlockNumber:head.toString(),minimumConfirmations})}));
  // Check canonical identity again after reading the head.
  for(const e of evidence){
   const b=await rpc('eth_getBlockByNumber',['0x'+BigInt(e.blockNumber).toString(16),false]);
   assert(b&&hash(b.hash,'post-head block hash')===e.blockHash,'Reorg after confirmation check');
  }
 }
 return {chainId:chainId.toString(),receipts:evidence,confirmationEvidence,verifiedByTool:false,caveat:'Single-RPC canonical consistency only; no independent finality proof. Include relayer, deployment, settlement and bridge fees separately. Receipt l1Fee support varies by chain.'};
}
