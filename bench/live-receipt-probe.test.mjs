import test from 'node:test';
import assert from 'node:assert/strict';
import { probeReceipt } from './live-receipt-probe.mjs';
const H='0x'+'ab'.repeat(32), B='0x'+'cd'.repeat(32);
function fixture(overrides={}) {
 const tx={hash:H,blockNumber:'0x7',blockHash:B,transactionIndex:'0x0'};
 const receipt={transactionHash:H,blockHash:B,blockNumber:'0x7',transactionIndex:'0x0',status:'0x1',gasUsed:'0x5208',effectiveGasPrice:'0x3b9aca00',l1Fee:'0x64'};
 const block={hash:B,number:'0x7',transactions:[H]};
 const values={eth_chainId:'0x2105',eth_getTransactionByHash:tx,eth_getTransactionReceipt:receipt,eth_getBlockByHash:block,...overrides};
 return (method)=>typeof values[method]==='function'?values[method]():values[method];
}
test('verified receipt computes gas plus Base L1 fee',async()=>{
 const r=await probeReceipt(fixture(),H,'8453');assert.equal(r.executionWei,'21000000000000');assert.equal(r.knownTotalWei,'21000000000100');assert.equal(r.networkFeeEvidenceComplete,true);assert.equal(r.costComplete,false);
});
test('rejects failed transaction',async()=>{await assert.rejects(probeReceipt(fixture({eth_getTransactionReceipt:{transactionHash:H,blockHash:B,blockNumber:'0x7',status:'0x0',gasUsed:'0x5208',effectiveGasPrice:'0x3b9aca00'}}),H,'8453'),/did not succeed/);});
test('rejects chain mismatch',async()=>{await assert.rejects(probeReceipt(fixture(),H,'1'),/Unexpected chain/);});
test('rejects missing block membership',async()=>{await assert.rejects(probeReceipt(fixture({eth_getBlockByHash:{hash:B,number:'0x7',transactions:[]}}),H,'8453'),/not in block/);});
test('rejects changed fee evidence',async()=>{let n=0;const base=fixture();await assert.rejects(probeReceipt((m)=>m==='eth_getTransactionReceipt'&&++n===2?{...base(m),l1Fee:'0x65'}:base(m),H,'8453'),/Receipt changed/);});
test('reports incomplete Base costs without l1Fee',async()=>{const base=fixture();const r=await probeReceipt(fixture({eth_getTransactionReceipt:{...base('eth_getTransactionReceipt'),l1Fee:undefined}}),H,'8453');assert.equal(r.costComplete,false);});

test('rejects mismatched transaction block hash',async()=>{const base=fixture();await assert.rejects(probeReceipt(fixture({eth_getTransactionByHash:{...base('eth_getTransactionByHash'),blockHash:'0x'+'ee'.repeat(32)}}),H,'8453'),/Transaction block hash mismatch/);});
test('rejects mismatched transaction index',async()=>{const base=fixture();await assert.rejects(probeReceipt(fixture({eth_getTransactionByHash:{...base('eth_getTransactionByHash'),transactionIndex:'0x1'}}),H,'8453'),/Transaction index mismatch/);});
test('rejects changed block membership on final observation',async()=>{let n=0;const base=fixture();await assert.rejects(probeReceipt((m)=>m==='eth_getBlockByHash'&&++n===2?{...base(m),transactions:[]}:base(m),H,'8453'),/Block changed/);});
test('network fees alone never assert full economic cost',async()=>{const r=await probeReceipt(fixture(),H,'8453');assert.equal(r.networkFeeEvidenceComplete,true);assert.equal(r.costComplete,false);});

test('rejects block membership at wrong transaction index',async()=>{
 const other='0x'+'ef'.repeat(32), base=fixture();
 const block={...base('eth_getBlockByHash'),transactions:[other,H]};
 await assert.rejects(probeReceipt(fixture({eth_getBlockByHash:block}),H,'8453'),/Transaction index mismatch/);
});
test('rejects absent transaction index evidence',async()=>{
 const base=fixture(), receipt={...base('eth_getTransactionReceipt')};
 delete receipt.transactionIndex;
 await assert.rejects(probeReceipt(fixture({eth_getTransactionReceipt:receipt}),H,'8453'),/Missing transaction index/);
});
test('accepts transaction at its actual nonzero block index',async()=>{
 const other='0x'+'ef'.repeat(32), base=fixture();
 const tx={...base('eth_getTransactionByHash'),transactionIndex:'0x1'};
 const receipt={...base('eth_getTransactionReceipt'),transactionIndex:'0x1'};
 const block={...base('eth_getBlockByHash'),transactions:[other,H]};
 const result=await probeReceipt(fixture({eth_getTransactionByHash:tx,eth_getTransactionReceipt:receipt,eth_getBlockByHash:block}),H,'8453');
 assert.equal(result.txHash,H);
});

test('rejects receipt index mutation between reads',async()=>{
 const base=fixture();let n=0;
 await assert.rejects(probeReceipt((m)=>m==='eth_getTransactionReceipt'&&++n===2?{...base(m),transactionIndex:'0x1'}:base(m),H,'8453'),/Receipt changed/);
});
test('rejects receipt transaction hash mutation between reads',async()=>{
 const base=fixture();let n=0;
 await assert.rejects(probeReceipt((m)=>m==='eth_getTransactionReceipt'&&++n===2?{...base(m),transactionHash:'0x'+'aa'.repeat(32)}:base(m),H,'8453'),/Receipt changed/);
});
test('rejects reordered final block even if transaction still present',async()=>{
 const base=fixture(),other='0x'+'ef'.repeat(32),tx={...base('eth_getTransactionByHash'),transactionIndex:'0x1'},receipt={...base('eth_getTransactionReceipt'),transactionIndex:'0x1'};
 let n=0;const initial={...base('eth_getBlockByHash'),transactions:[other,H]};
 const rpc=(m)=>m==='eth_getTransactionByHash'?tx:m==='eth_getTransactionReceipt'?receipt:m==='eth_getBlockByHash'&&++n===2?{...initial,transactions:[H,other]}:m==='eth_getBlockByHash'?initial:base(m);
 await assert.rejects(probeReceipt(rpc,H,'8453'),/Block changed/);
});
test('rejects changed unrelated block transaction during final observation',async()=>{
 const base=fixture(),other='0x'+'ef'.repeat(32),changed='0x'+'aa'.repeat(32),tx={...base('eth_getTransactionByHash'),transactionIndex:'0x1'},receipt={...base('eth_getTransactionReceipt'),transactionIndex:'0x1'};
 let n=0;const initial={...base('eth_getBlockByHash'),transactions:[other,H]};
 const rpc=(m)=>m==='eth_getTransactionByHash'?tx:m==='eth_getTransactionReceipt'?receipt:m==='eth_getBlockByHash'&&++n===2?{...initial,transactions:[changed,H]}:m==='eth_getBlockByHash'?initial:base(m);
 await assert.rejects(probeReceipt(rpc,H,'8453'),/Block changed/);
});

test('accepts hex Base chain ID and normalizes its fee completeness',async()=>{
 const r=await probeReceipt(fixture(),H,'0x2105');
 assert.equal(r.chainId,'8453');
 assert.equal(r.networkFeeEvidenceComplete,true);
 assert.equal(r.costComplete,false);
});
test('accepts hex Ethereum chain ID and normalizes its fee completeness',async()=>{
 const r=await probeReceipt(fixture({eth_chainId:'0x1'}),H,'0x1');
 assert.equal(r.chainId,'1');
 assert.equal(r.networkFeeEvidenceComplete,true);
});
test('rejects negative L1 fee rather than reducing measured costs',async()=>{
 const base=fixture();
 await assert.rejects(probeReceipt(fixture({eth_getTransactionReceipt:{...base('eth_getTransactionReceipt'),l1Fee:'-0x1'}}),H,'8453'),/Cannot convert|Invalid L1 fee/);
});
test('rejects zero expected chain ID',async()=>{
 await assert.rejects(probeReceipt(fixture(),H,'0'),/Invalid expected chain/);
});
