import test from 'node:test';
import assert from 'node:assert/strict';
import {observeErc20Deltas,compareErc20Outcomes} from './erc20-outcome-reconciliation.mjs';
const addr=n=>'0x'+n.toString(16).padStart(40,'0');
const hash=n=>'0x'+n.toString(16).padStart(64,'0');
const token=addr(9),payer=addr(1),recipient=addr(2);
const before={number:'10',hash:hash(10)},after={number:'11',hash:hash(11)};
function rpc(values={}) {
 return async (method,params)=>{
  if(method==='eth_chainId')return values.chain||'0x2105';
  if(method==='eth_getBlockByNumber'){const n=BigInt(params[0]);return {number:params[0],hash:values.badHash&&n===11n?hash(99):hash(Number(n))};}
  if(method==='eth_call'){
   const account='0x'+params[0].data.slice(-40);
   const selector=params[1];
   if(!selector||selector.blockHash!==hash(10)&&selector.blockHash!==hash(11)||selector.requireCanonical!==true)throw Error('missing canonical block hash pin');
   const n=selector.blockHash===hash(10)?10n:11n;let balance=account===payer?(n===10n?100n:60n):(n===10n?0n:40n);
   if(values.altered&&account===recipient&&n===11n)balance+=1n;
   return '0x'+balance.toString(16).padStart(64,'0');
  }
  throw Error('unexpected RPC '+method);
 };
}
const args=(a=rpc(),b=rpc())=>({rpcA:a,rpcB:b,chainId:'8453',token,accounts:[payer,recipient],before,after});
test('observes both payer and recipient deltas',async()=>{
 const o=await observeErc20Deltas(args());assert.equal(o.deltas[payer],'-40');assert.equal(o.deltas[recipient],'40');assert.equal(o.verifiedSavingsEligible,false);
});
test('rejects disagreeing RPC balance reads',async()=>{await assert.rejects(observeErc20Deltas(args(rpc(),rpc({altered:true}))),/balance disagreement/);});
test('rejects noncanonical snapshot',async()=>{await assert.rejects(observeErc20Deltas(args(rpc({badHash:true}),rpc())),/noncanonical/);});
test('rejects wrong chain',async()=>{await assert.rejects(observeErc20Deltas(args(rpc({chain:'0x1'}),rpc())),/chain mismatch/);});
test('rejects duplicate account',async()=>{await assert.rejects(observeErc20Deltas({...args(),accounts:[payer,payer]}),/duplicate/);});
test('rejects same RPC function',async()=>{const a=rpc();await assert.rejects(observeErc20Deltas(args(a,a)),/distinct/);});
test('rejects reversed interval',async()=>{await assert.rejects(observeErc20Deltas({...args(),before:after,after:before}),/interval/);});
test('accepts equivalent observed deltas but not savings proof',async()=>{
 const a=await observeErc20Deltas(args()),b=await observeErc20Deltas(args());
 const result=compareErc20Outcomes(a,b,{[payer]:'-40',[recipient]:'40'});
 assert.equal(result.equivalentObservedDeltas,true);assert.equal(result.verifiedSavingsEligible,false);
});
test('rejects mismatched expected recipient outcome',async()=>{
 const a=await observeErc20Deltas(args()),b=await observeErc20Deltas(args());
 assert.throws(()=>compareErc20Outcomes(a,b,{[payer]:'-40',[recipient]:'39'}),/outcome mismatch/);
});
test('rejects incomplete account coverage',async()=>{
 const a=await observeErc20Deltas(args()),b=await observeErc20Deltas(args());
 assert.throws(()=>compareErc20Outcomes(a,b,{[recipient]:'40'}),/coverage/);
});

test('pins all balance reads to canonical EIP-1898 block hashes',async()=>{
 const reads=[];const a=rpc(),b=rpc();
 const track=fn=>async(method,params)=>{if(method==='eth_call')reads.push(params[1]);return fn(method,params)};
 await observeErc20Deltas(args(track(a),track(b)));
 assert.equal(reads.length,8);
 assert.equal(reads.filter(x=>x.blockHash===before.hash).length,4);
 assert.equal(reads.filter(x=>x.blockHash===after.hash).length,4);
 assert.ok(reads.every(x=>x.requireCanonical===true));
});
test('fails closed if RPC rejects EIP-1898 block hash selectors',async()=>{
 const reject=async(method,params)=>{if(method==='eth_call')throw Error('EIP-1898 unsupported');return rpc()(method,params)};
 await assert.rejects(observeErc20Deltas(args(reject,rpc())),/EIP-1898 unsupported/);
});
