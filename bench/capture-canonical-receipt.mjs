// SPDX-License-Identifier: MIT
// Read-only, independently recheckable receipt capture. Does NOT prove recipient outcomes.
const HASH=/^0x[0-9a-fA-F]{64}$/;
const Q=/^0x(?:0|[1-9a-fA-F][0-9a-fA-F]*)$/;
function quantity(v,name){if(typeof v!=='string'||!Q.test(v))throw Error(name+': invalid hex quantity');return BigInt(v);}
function hash(v,name){if(typeof v!=='string'||!HASH.test(v))throw Error(name+': invalid hash');return v.toLowerCase();}
function same(a,b){return a.toLowerCase()===b.toLowerCase();}
export async function captureReceipt(rpc,txHash,{confirmations=2,expectedChainId,requireType4=false}={}){
 if(typeof rpc!=='function')throw Error('RPC function required');
 if(!Number.isSafeInteger(confirmations)||confirmations<1||confirmations>1000)throw Error('invalid confirmations');
 const target=hash(txHash,'txHash');
 const chain=quantity(await rpc('eth_chainId',[]),'chainId');
 if(chain===0n)throw Error('zero chainId');
 if(expectedChainId!==undefined&&chain!==BigInt(expectedChainId))throw Error('unexpected chainId');
 const receipt=await rpc('eth_getTransactionReceipt',[target]);
 if(!receipt||typeof receipt!=='object')throw Error('missing receipt');
 if(!same(hash(receipt.transactionHash,'receipt.transactionHash'),target))throw Error('receipt hash mismatch');
 if(receipt.status!=='0x1')throw Error('receipt not successful');
 const blockHash=hash(receipt.blockHash,'receipt.blockHash');
 const blockNumber=quantity(receipt.blockNumber,'receipt.blockNumber');
 const gas=quantity(receipt.gasUsed,'receipt.gasUsed');
 const price=quantity(receipt.effectiveGasPrice,'receipt.effectiveGasPrice');
 if(gas===0n||price===0n)throw Error('missing receipt gas/price');
 const tx=await rpc('eth_getTransactionByHash',[target]);
 if(!tx||typeof tx!=='object')throw Error('missing transaction');
 if(!same(hash(tx.hash,'tx.hash'),target)||!same(hash(tx.blockHash,'tx.blockHash'),blockHash)||
    quantity(tx.blockNumber,'tx.blockNumber')!==blockNumber)throw Error('transaction inclusion mismatch');
 const type=quantity(tx.type,'tx.type');
 if(receipt.type!==undefined&&quantity(receipt.type,'receipt.type')!==type)throw Error('transaction type mismatch');
 if(requireType4&&type!==4n)throw Error('not an EIP-7702 type-4 transaction');
 if(tx.chainId!==undefined&&quantity(tx.chainId,'tx.chainId')!==chain)throw Error('transaction chain mismatch');
 const block=await rpc('eth_getBlockByNumber',['0x'+blockNumber.toString(16),false]);
 if(!block||!same(hash(block.hash,'block.hash'),blockHash)||
    quantity(block.number,'block.number')!==blockNumber)throw Error('noncanonical block');
 const tip=quantity(await rpc('eth_blockNumber',[]),'tip');
 if(tip<blockNumber+BigInt(confirmations)-1n)throw Error('insufficient confirmations');
 const finalBlock=await rpc('eth_getBlockByNumber',['0x'+blockNumber.toString(16),false]);
 if(!finalBlock||!same(hash(finalBlock.hash,'finalBlock.hash'),blockHash))throw Error('block changed during verification');
 if(quantity(await rpc('eth_chainId',[]),'finalChainId')!==chain)throw Error('RPC chain changed during verification');
 return Object.freeze({
  kind:'READ_ONLY_RPC_RECEIPT_OBSERVATION_NOT_OUTCOME_PROOF',
  chainId:chain.toString(),txHash:target,blockHash,blockNumber:blockNumber.toString(),
  transactionType:type.toString(),gasUsed:gas.toString(),effectiveGasPrice:price.toString(),
  receiptExecutionWei:(gas*price).toString(),confirmationsObserved:(tip-blockNumber+1n).toString(),
  limitations:'RPC observations are not independently authenticated consensus; recipient balances, L2 data fees, relayer, authorization, deployment and settlement costs remain unverified.'
 });
}
