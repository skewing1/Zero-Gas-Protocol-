import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer} from 'node:http';
import {localRpc,captureLocalFile} from './local-receipt-capture.mjs';
const H='0x'+'a'.repeat(64),B='0x'+'b'.repeat(64);
const replies={eth_chainId:'0x7a69',eth_getTransactionReceipt:{transactionHash:H,blockHash:B,blockNumber:'0x1',transactionIndex:'0x0',status:'0x1',gasUsed:'0x5208',effectiveGasPrice:'0x2'},eth_getTransactionByHash:{hash:H,blockHash:B,blockNumber:'0x1',transactionIndex:'0x0',chainId:'0x7a69',gas:'0x5208'},eth_getBlockByNumber:{hash:B,number:'0x1',transactions:[H]}};
test('rejects remote and credentialed endpoints',()=>{
 for(const url of ['https://example.com','http://192.168.1.1:8545','http://user:secret@localhost:8545','file:///tmp/rpc','http://localhost:8545/?token=secret'])assert.throws(()=>localRpc(url));
});
test('permits only explicitly listed read methods',async()=>{
 const rpc=localRpc('http://127.0.0.1:8545',async()=>{throw Error('must not call')});
 await assert.rejects(rpc('eth_sendRawTransaction',['0x00']),/Read-only/);
});
test('rejects JSON-RPC error and mismatched request IDs',async()=>{
 for(const body of [{jsonrpc:'2.0',id:2,result:'0x7a69'},{jsonrpc:'2.0',id:1,error:{code:-1,message:'failed'}}]){
  const rpc=localRpc('http://localhost:8545',async()=>({ok:true,json:async()=>body}));
  await assert.rejects(rpc('eth_chainId'),/Invalid JSON-RPC/);
 }
});
test('captures actual loopback JSON-RPC response and writes evidence once',async()=>{
 const calls=[];
 const server=createServer(async(req,res)=>{
  let raw='';for await(const c of req)raw+=c;
  const request=JSON.parse(raw);calls.push(request.method);
  res.setHeader('content-type','application/json');res.end(JSON.stringify({jsonrpc:'2.0',id:request.id,result:replies[request.method]}));
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const dir=await mkdtemp(join(tmpdir(),'receipt-capture-'));
 try{
  const input=join(dir,'hashes.json'),output=join(dir,'evidence.json');
  await writeFile(input,JSON.stringify([H]));
  const result=await captureLocalFile({rpcUrl:`http://127.0.0.1:${server.address().port}`,hashesPath:input,outputPath:output});
  assert.equal(result.receipts[0].executionWei,'42000');assert.equal(result.receipts[0].dataWei,'0');
  assert.equal(JSON.parse(await readFile(output,'utf8')).verifiedByTool,false);
  assert(!calls.some(m=>m.startsWith('eth_send')));
  await assert.rejects(captureLocalFile({rpcUrl:`http://127.0.0.1:${server.address().port}`,hashesPath:input,outputPath:output}),/EEXIST/);
 }finally{server.close();await rm(dir,{recursive:true,force:true})}
});
