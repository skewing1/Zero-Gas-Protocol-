// Independent deterministic reference-model tests for the Solidity workload.
import assert from 'node:assert/strict';
import test from 'node:test';
function single(state,sender,to,amount) {
 if(to===0) throw Error('zero');
 if((state.get(sender)||0n)<amount) throw Error('insufficient');
 state.set(sender,state.get(sender)-amount);
 state.set(to,(state.get(to)||0n)+amount);
}
function batch(state,sender,recipients,amounts) {
 if(recipients.length!==amounts.length) throw Error('length');
 let total=0n;
 for(let i=0;i<recipients.length;i++) {
  if(recipients[i]===0||recipients[i]===sender) throw Error('recipient');
  total+=amounts[i];
 }
 if((state.get(sender)||0n)<total) throw Error('insufficient');
 state.set(sender,state.get(sender)-total);
 for(let i=0;i<recipients.length;i++)state.set(recipients[i],(state.get(recipients[i])||0n)+amounts[i]);
}
for(const n of [0,1,2,10,100,1000])test(`reference state equivalence n=${n}`,()=>{
 const recipients=Array.from({length:n},(_,i)=>i%13+2);
 const amounts=Array.from({length:n},(_,i)=>BigInt(i+1));
 const a=new Map([[1,10000000n]]),b=new Map(a);
 for(let i=0;i<n;i++)single(a,1,recipients[i],amounts[i]);
 batch(b,1,recipients,amounts);
 assert.deepEqual([...a.entries()].sort((x,y)=>x[0]-y[0]),[...b.entries()].sort((x,y)=>x[0]-y[0]));
});
test('rejects insufficient balance',()=>assert.throws(()=>batch(new Map([[1,1n]]),1,[2],[2n]),/insufficient/));
test('rejects self transfer',()=>assert.throws(()=>batch(new Map([[1,5n]]),1,[1],[1n]),/recipient/));
test('rejects mismatched array lengths',()=>assert.throws(()=>batch(new Map([[1,5n]]),1,[2],[],),/length/));
