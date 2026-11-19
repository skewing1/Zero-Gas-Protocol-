import test from 'node:test';
import assert from 'node:assert/strict';
import { reconcileRecipientOutcomes } from './recipient-outcomes.mjs';
const A='0x'+'a'.repeat(40), B='0x'+'b'.repeat(40);
const snap=(entries)=>({chainId:'31337',asset:'native',recipients:entries});
const base=()=>snap([{address:A,before:'100',after:'130'},{address:B,before:'1',after:'9'}]);
const candidate=()=>snap([{address:B,before:'1000',after:'1008'},{address:A,before:'0',after:'30'}]);
test('same deltas across distinct initial balances and recipient order',()=>{
 const result=reconcileRecipientOutcomes(base(),candidate());
 assert.equal(result.equivalent,true);assert.equal(result.verifiedByTool,false);
 assert.match(result.outcomeDigest,/^0x[0-9a-f]{64}$/);
});
test('rejects changed recipient payout',()=>{
 const c=candidate();c.recipients[0].after='1007';
 assert.throws(()=>reconcileRecipientOutcomes(base(),c),/Different recipient balance deltas/);
});
test('rejects duplicate recipients even with case changes',()=>{
 const c=candidate();c.recipients.push({address:A.toUpperCase().replace('0X','0x'),before:'0',after:'30'});
 assert.throws(()=>reconcileRecipientOutcomes(base(),c),/duplicate recipient/);
});
test('rejects negative and malformed balances',()=>{
 const c=candidate();c.recipients[0].after='-1';
 assert.throws(()=>reconcileRecipientOutcomes(base(),c),/unsigned decimal/);
});
test('rejects balance decreases',()=>{
 const c=candidate();c.recipients[0].after='999';
 assert.throws(()=>reconcileRecipientOutcomes(base(),c),/balance decreased/);
});
test('rejects chain or asset mismatch',()=>{
 const c=candidate();c.chainId='8453';
 assert.throws(()=>reconcileRecipientOutcomes(base(),c),/Different chain or asset/);
});
test('rejects incomplete recipient evidence',()=>{
 const c=candidate();c.recipients.pop();
 assert.throws(()=>reconcileRecipientOutcomes(base(),c),/Different recipient balance deltas/);
});
