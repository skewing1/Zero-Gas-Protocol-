// SPDX-License-Identifier: MIT
// Structural inspection only; does not recover signatures or authenticate authorization.
const ADDRESS=/^0x[0-9a-fA-F]{40}$/;
const Q=/^0x(?:0|[1-9a-fA-F][0-9a-fA-F]*)$/;
const N=BigInt('0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141');
function quantity(x,name){if(typeof x!=='string'||!Q.test(x))throw Error(name+': invalid quantity');return BigInt(x)}
function scalar(x,name){const n=quantity(x,name);if(n===0n||n>=N)throw Error(name+': invalid secp256k1 scalar');return n}
export function inspectType4Authorization(tx,{expectedChainId}={}){
 if(!tx||typeof tx!=='object'||quantity(tx.type,'type')!==4n)throw Error('requires type-4 transaction');
 const txChain=quantity(tx.chainId,'chainId');if(txChain===0n||txChain>=(1n<<256n))throw Error('invalid transaction chain');
 if(expectedChainId!==undefined&&txChain!==BigInt(expectedChainId))throw Error('unexpected transaction chain');
 if(!Array.isArray(tx.authorizationList)||tx.authorizationList.length===0)throw Error('missing authorizationList');
 if(tx.authorizationList.length>1024)throw Error('authorizationList exceeds inspection bound');
 const items=[];
 for(const [i,a] of tx.authorizationList.entries()){
  const prefix='authorizationList['+i+']';
  if(!a||typeof a!=='object')throw Error(prefix+': missing tuple');
  const chain=quantity(a.chainId,prefix+'.chainId');
  if(chain!==0n&&chain!==txChain)throw Error(prefix+': chain mismatch');
  if(typeof a.address!=='string'||!ADDRESS.test(a.address))throw Error(prefix+': invalid delegate address');
  const nonce=quantity(a.nonce,prefix+'.nonce');if(nonce>=(1n<<64n))throw Error(prefix+': nonce overflow');
  const parity=quantity(a.yParity??a.v,prefix+'.yParity');if(parity>1n)throw Error(prefix+': invalid parity');
  scalar(a.r,prefix+'.r');scalar(a.s,prefix+'.s');
  items.push(Object.freeze({chainId:chain.toString(),delegate:a.address.toLowerCase(),nonce:nonce.toString()}));
 }
 return Object.freeze({kind:'UNVERIFIED_EIP7702_AUTHORIZATION_STRUCTURE',transactionChainId:txChain.toString(),authorizationCount:items.length,authorizations:Object.freeze(items),limitations:'No signature recovery, delegation code verification, signer identity, nonce-state validation, signed-intent verification, or receipt/outcome authentication.'});
}
