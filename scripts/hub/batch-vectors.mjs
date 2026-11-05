import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { keccak256, concatHex, toHex, encodeAbiParameters, hashTypedData } from '../../node/node_modules/viem/_esm/index.js';
import { privateKeyToAccount } from '../../node/node_modules/viem/_esm/accounts/index.js';
const h=keccak256, cat=concatHex;
const w=n=>toHex(BigInt(n),{size:32}), u32=n=>toHex(BigInt(n),{size:4});
const repeat=(b,n)=>'0x'+b.repeat(n);
const pair=(tag,l,r)=>h(cat([tag,l,r]));
function sparse(entries) {
  const groups=new Map();
  for(const [key,value]of entries){const path=BigInt(key.slice(0,10));const bucket=groups.get(path)??[];bucket.push([key,value]);groups.set(path,bucket);}
  let layer=new Map([...groups].map(([key,bucket])=>{
    bucket.sort((a,b)=>a[0].localeCompare(b[0]));
    return [key,h(cat(['0x02',u32(bucket.length),...bucket.flat()]))];
  }));
  let empty=h('0x00');
  for(let depth=0;depth<32;depth++){
    const next=new Map();
    for(const key of layer.keys()){
      const parent=key/2n;
      next.set(parent,pair('0x01',layer.get(parent*2n)??empty,layer.get(parent*2n+1n)??empty));
    }
    layer=next;empty=pair('0x01',empty,empty);
  }
  return layer.get(0n)??empty;
}
function stateRoot(accounts) {
  const leaves=accounts.map(({address,nonce,balances})=>{
    const ordered=balances.filter(([,amount])=>amount!==0n).sort((a,b)=>a[0].localeCompare(b[0]));
    const leaf=h(cat(['0x11',address,w(nonce),u32(ordered.length),...ordered.flatMap(([asset,amount])=>[asset,w(amount)])]));
    return [h(cat(['0x10',address])),leaf];
  });
  return pair('0x03',sparse(leaves),h(cat(['0x07',u32(0)])));
}
const payer=privateKeyToAccount(repeat('07',32)).address.toLowerCase(); // Public deterministic test key only.
const asset=h(encodeAbiParameters([{type:'uint256'},{type:'address'}],[31338n,repeat('00',20)]));
const hub=repeat('05',20),feeRecipient=repeat('08',20),payee=repeat('02',20);
const oldRoot=stateRoot([{address:payer,nonce:0n,balances:[[asset,100n]]}]);
const newRoot=stateRoot([
  {address:payer,nonce:2n,balances:[[asset,83n]]},
  {address:payee,nonce:0n,balances:[[asset,15n]]},
  {address:feeRecipient,nonce:0n,balances:[[asset,2n]]},
]);
const fields=[['from','address'],['to','address'],['assetId','bytes32'],['amount','uint256'],['fee','uint256'],['feeAssetId','bytes32'],['nonce','uint256'],['deadline','uint64'],['serviceId','bytes32'],['manifestHash','bytes32']].map(([name,type])=>({name,type}));
const context=h(cat(['0x08',oldRoot,w(31337),hub,feeRecipient,toHex(50n,{size:8})]));
const leaves=[10n,5n].map((amount,index)=>{
  const digest=hashTypedData({domain:{name:'ZeroGasHub',version:'1',chainId:31337,verifyingContract:hub},types:{HubTransfer:fields},primaryType:'HubTransfer',message:{from:payer,to:payee,assetId:asset,amount,fee:1n,feeAssetId:asset,nonce:BigInt(index),deadline:100n,serviceId:repeat('03',32),manifestHash:repeat('04',32)}});
  return h(cat(['0x04',context,u32(index),digest]));
});
const receiptsRoot=pair('0x06',leaves[0],leaves[1]);
const publicValues=encodeAbiParameters(['uint32','bytes32','bytes32','uint256','address','address','uint64','uint64','bytes32','uint32'].map(type=>({type})),[1,oldRoot,newRoot,31337n,hub,feeRecipient,50n,100n,receiptsRoot,2]);
const a='0x12345678'+'00'.repeat(28), b='0x12345678'+'00'.repeat(27)+'01';
const collisionRoot=sparse([[a,repeat('01',32)],[b,repeat('02',32)]]);
const vector=['# viem 2.38.6 independent root/ABI vector; local deterministic fixture only',...Object.entries({oldRoot,newRoot,receiptsRoot,collisionRoot,publicValues}).map(([k,v])=>`${k}=${v}`),''].join('\n');
const path='hub/kernel/vectors/batch-roots.txt';
if(process.argv.includes('--check'))assert.equal(readFileSync(path,'utf8'),vector,'Rust/Node vector fixture drift');
else writeFileSync(path,vector);
console.log(process.argv.includes('--check')?'Batch vectors match':'Batch vectors written');
