import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectDelegation} from './7702-state.mjs';
const a = '0x' + '11'.repeat(20), d = '0x' + '22'.repeat(20);
const opts = () => ({chainId:'8453',account:a,delegate:d,expectedNonce:'4',deadline:'200'});
const responses = () => ({eth_chainId:'0x2105',eth_getBlockByNumber:{number:'0x12',timestamp:'0x64',hash:'0x'+'ab'.repeat(32)},eth_getCode:'0xef0100'+d.slice(2),eth_getTransactionCount:'0x4'});
const mock = r => async (method) => r[method];
test('observes delegation but never authorizes payment', async () => {
  const result=await inspectDelegation(mock(responses()),opts());
  assert.equal(result.delegationObserved,true); assert.equal(result.safeToRelay,false);
  assert.equal(result.signatureVerified,false); assert.equal(result.intentNonceVerified,false);
});
for (const [name, mutate] of [
  ['wrong chain',r=>r.eth_chainId='0x1'],['undelegated EOA',r=>r.eth_getCode='0x'],
  ['wrong delegate',r=>r.eth_getCode='0xef0100'+a.slice(2)],
  ['wrong nonce',r=>r.eth_getTransactionCount='0x5'],
  ['invalid nonce encoding',r=>r.eth_getTransactionCount='0x04'],
  ['invalid timestamp',r=>r.eth_getBlockByNumber.timestamp='100'],
  ['invalid block hash',r=>r.eth_getBlockByNumber.hash='0x12'],
  ['missing block',r=>r.eth_getBlockByNumber=null]
]) test('rejects '+name, async()=>{const r=responses();mutate(r);await assert.rejects(inspectDelegation(mock(r),opts()));});
test('rejects expired intent',async()=>{const o=opts();o.deadline='100';await assert.rejects(inspectDelegation(mock(responses()),o));});
test('rejects unsupported chain',async()=>{const o=opts();o.chainId='10';await assert.rejects(inspectDelegation(mock(responses()),o));});
test('rejects invalid account',async()=>{const o=opts();o.account='0x123';await assert.rejects(inspectDelegation(mock(responses()),o));});
test('rejects noncanonical expected nonce',async()=>{const o=opts();o.expectedNonce='04';await assert.rejects(inspectDelegation(mock(responses()),o));});
