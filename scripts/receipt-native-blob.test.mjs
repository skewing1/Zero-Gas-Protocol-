import test from 'node:test';
import assert from 'node:assert/strict';
import { reconcileReceiptCost } from './receipt-cost-reconciliation.mjs';
const r = {status:'0x1',gasUsed:'0x5208',effectiveGasPrice:'0x2'};
test('Ethereum mined blob fee is included exactly once',()=>{
 const v=reconcileReceiptCost('1',{...r,blobGasUsed:'0x20000',blobGasPrice:'0x3'});
 assert.equal(v.blobFeeWei,'393216');
 assert.equal(v.totalObservedWei,(42000n+393216n).toString());
});
test('conflicting blob override is rejected',()=>{
 assert.throws(()=>reconcileReceiptCost('1',{...r,blobGasUsed:'0x2',blobGasPrice:'0x3'},{blobFeeWei:'5'}),/Conflicting native blob fee/);
});
test('matching blob override is not double counted',()=>{
 assert.equal(reconcileReceiptCost('1',{...r,blobGasUsed:'0x2',blobGasPrice:'0x3'},{blobFeeWei:'6'}).totalObservedWei,'42006');
});
test('incomplete blob fields fail closed',()=>{
 assert.throws(()=>reconcileReceiptCost('1',{...r,blobGasUsed:'0x2'}),/Incomplete native blob/);
});
test('separate blob fee is retained when receipt lacks blob fields',()=>{
 assert.equal(reconcileReceiptCost('8453',{...r,l1Fee:'0x5'},{blobFeeWei:'7'}).totalObservedWei,'42012');
});
test('Ethereum cannot add arbitrary separate L1 data fees',()=>{
 assert.throws(()=>reconcileReceiptCost('1',r,{l1FeeWei:'10'}),/Ethereum L1 data fee/);
});
