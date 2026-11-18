// Confirmation-depth observation only. Depth is not economic finality.
// Requires the receipt identity audit and checks canonical ancestry at the observed height.
import { auditReceiptIdentity } from './rpc-receipt-identity-audit.mjs';
const quantity = x => typeof x === 'string' && /^0x(0|[1-9a-fA-F][0-9a-fA-F]*)$/.test(x);
function requireValue(ok,message){if(!ok)throw new Error(message);}
async function read(rpc,method,params){
  const response=await rpc(method,params);
  requireValue(response && typeof response==='object' && !response.error,method+' RPC failure');
  return Object.prototype.hasOwnProperty.call(response,'result')?response.result:response;
}
export async function auditReceiptConfirmations(rpc,expected,{minimumConfirmations=12}={}){
  requireValue(Number.isSafeInteger(minimumConfirmations)&&minimumConfirmations>=1,'Invalid minimum confirmations');
  const identity=await auditReceiptIdentity(rpc,expected);
  const latest=await read(rpc,'eth_blockNumber',[]);
  requireValue(quantity(latest),'Invalid latest block height');
  const height=BigInt(identity.blockNumber), head=BigInt(latest);
  requireValue(head>=height,'Receipt block above chain head');
  const confirmations=head-height+1n;
  requireValue(confirmations>=BigInt(minimumConfirmations),'Insufficient confirmations');
  const block=await read(rpc,'eth_getBlockByNumber',['0x'+height.toString(16),false]);
  requireValue(block && typeof block.hash==='string' && block.hash.toLowerCase()===identity.blockHash,'Canonical block changed after depth check');
  requireValue(quantity(block.number)&&BigInt(block.number)===height,'Canonical height changed after depth check');
  const latestAgain=await read(rpc,'eth_blockNumber',[]);
  requireValue(quantity(latestAgain)&&BigInt(latestAgain)>=head,'Chain head regressed during confirmation check');
  return Object.freeze({...identity,observedHead:head.toString(),observedConfirmations:confirmations.toString(),
    minimumConfirmations,confirmationDepthPassed:true,finalityVerified:false,independentlyVerified:false});
}
