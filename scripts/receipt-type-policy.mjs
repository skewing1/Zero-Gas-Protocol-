// Reject benchmark cohorts that claim EIP-7702 without mined type-4 evidence.
const HEX=/^0x(?:0|[1-9a-fA-F][0-9a-fA-F]*)$/;
export function requireEip7702Receipt({transaction,receipt,expectedChainId}) {
  if(!transaction||!receipt)throw new Error('Missing mined transaction or receipt');
  for(const [name,v] of Object.entries({transactionType:transaction.type,receiptType:receipt.type,transactionChainId:transaction.chainId,expectedChainId})) {
    if(typeof v!=='string'||!HEX.test(v))throw new Error('Invalid '+name);
  }
  if(BigInt(transaction.type)!==4n||BigInt(receipt.type)!==4n)throw new Error('Mined transaction is not EIP-7702 type 4');
  if(BigInt(transaction.chainId)!==BigInt(expectedChainId))throw new Error('EIP-7702 transaction chain mismatch');
  if(!Array.isArray(transaction.authorizationList)||transaction.authorizationList.length===0)throw new Error('Missing mined authorization list');
  return Object.freeze({transactionType:'4',authorizationCount:transaction.authorizationList.length});
}
