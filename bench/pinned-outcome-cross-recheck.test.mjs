import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyPinnedPaymentOutcomes } from './pinned-outcome-bridge.mjs';

const A='0x'+'12'.repeat(20), H1='0x'+'ab'.repeat(32), H2='0x'+'cd'.repeat(32);
const before={number:'10',hash:H1}, after={number:'11',hash:H2};
const path={chainId:'8453',outcome:[{recipient:A,asset:'native',deltaWei:'5'}]};
function rpcFactory({reorgBefore=false,changeChain=false}={}) {
  let beforeReads=0, chainReads=0;
  return async (method,params)=>{
    if(method==='eth_chainId') {
      chainReads++;
      return changeChain && chainReads===5 ? '0x1' : '0x2105';
    }
    if(method==='eth_getBlockByNumber') {
      const isBefore=BigInt(params[0])===10n;
      if(isBefore)beforeReads++;
      return {number:params[0],hash:isBefore?(reorgBefore&&beforeReads===3?'0x'+'ee'.repeat(32):H1):H2};
    }
    if(method==='eth_getBalance')return params[1].blockHash===H1?'0x64':'0x69';
    throw Error(method);
  };
}
test('accepts stable pinned snapshots after final cross-read rechecks',async()=>{
  const result=await verifyPinnedPaymentOutcomes(rpcFactory(),path,before,after);
  assert.equal(result.checkedRecipients,1);
  assert.equal(result.finalityVerified,false);
});
test('rejects reorg of before block after after-snapshot was collected',async()=>{
  await assert.rejects(verifyPinnedPaymentOutcomes(rpcFactory({reorgBefore:true}),path,before,after),/changed across snapshot/);
});
test('rejects chain switch after both collectors completed',async()=>{
  await assert.rejects(verifyPinnedPaymentOutcomes(rpcFactory({changeChain:true}),path,before,after),/chain changed across snapshot/);
});
