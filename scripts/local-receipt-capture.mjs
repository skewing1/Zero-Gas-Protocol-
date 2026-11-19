#!/usr/bin/env node
// Offline-safe receipt capture CLI: connects only to loopback JSON-RPC, never broadcasts.
import assert from 'node:assert/strict';
import {captureReceiptCosts} from './receipt-cost-evidence.mjs';
import {readFile,writeFile} from 'node:fs/promises';

export function localRpc(url, fetchImpl=fetch){
 const u=new URL(url);
 assert(['http:','https:'].includes(u.protocol),'Unsupported RPC scheme');
 assert(['localhost','127.0.0.1','[::1]'].includes(u.hostname),'Only loopback RPC allowed');
 assert(!u.username&&!u.password&&!u.hash&&!u.search,'RPC credentials, query and fragment forbidden');
 let id=0;
 return async(method,params=[])=>{
  assert(/^eth_(chainId|getTransactionReceipt|getTransactionByHash|getBlockByNumber)$/.test(method),'Read-only RPC method required');
  const requestId=++id;
  const response=await fetchImpl(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:requestId,method,params}),signal:AbortSignal.timeout(10000)});
  assert(response.ok,'RPC HTTP failure: '+response.status);
  const body=await response.json();
  assert(body?.jsonrpc==='2.0'&&body.id===requestId&&!body.error&&Object.hasOwn(body,'result'),'Invalid JSON-RPC response');
  return body.result;
 };
}
export async function captureLocalFile({rpcUrl,hashesPath,outputPath}){
 assert(typeof outputPath==='string'&&outputPath.length>0,'Output path required');
 const hashes=JSON.parse(await readFile(hashesPath,'utf8'));
 const result=await captureReceiptCosts({rpc:localRpc(rpcUrl),transactionHashes:hashes,dataFeeMode:'zero-local'});
 await writeFile(outputPath,JSON.stringify(result,null,2)+'\n',{flag:'wx',mode:0o600});
 return result;
}
if(process.argv[1]?.endsWith('/local-receipt-capture.mjs')){
 try{
  assert(process.argv.length===5,'Usage: node scripts/local-receipt-capture.mjs http://127.0.0.1:8545 hashes.json output.json');
  const result=await captureLocalFile({rpcUrl:process.argv[2],hashesPath:process.argv[3],outputPath:process.argv[4]});
  console.log(`Captured ${result.receipts.length} locally mined receipts; no savings claim.`);
 }catch(error){console.error(error.message);process.exitCode=1}
}
