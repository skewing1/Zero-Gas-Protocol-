// Read-only ERC20 balance-delta reconciliation across two RPC transports.
// Block snapshots must be canonical on BOTH transports. Not independent-provider proof.
// Token transfers outside the measured workload between snapshots invalidate attribution.
const ADDR=/^0x[0-9a-fA-F]{40}$/;
const HASH=/^0x[0-9a-fA-F]{64}$/;
const HEX=/^0x(?:0|[1-9a-f][0-9a-f]*)$/;
const DEC=/^(0|[1-9][0-9]*)$/;
function quantity(v,label){if(typeof v!=='string'||!HEX.test(v))throw Error(label+': noncanonical RPC quantity');return BigInt(v)}
function address(v,label){if(typeof v!=='string'||!ADDR.test(v))throw Error(label+': invalid address');return v.toLowerCase()}
function hash(v,label){if(typeof v!=='string'||!HASH.test(v))throw Error(label+': invalid hash');return v.toLowerCase()}
function blockNumber(v){if(typeof v!=='string'||!DEC.test(v))throw Error('noncanonical block number');return BigInt(v)}
async function snapshot(rpc,chainId,block){
 const observed=quantity(await rpc('eth_chainId',[]),'chainId');
 if(observed!==chainId)throw Error('RPC chain mismatch');
 const tag='0x'+block.number.toString(16);
 const b=await rpc('eth_getBlockByNumber',[tag,false]);
 if(!b||hash(b.hash,'block hash')!==block.hash||quantity(b.number,'block number')!==block.number)throw Error('noncanonical snapshot block');
 return tag;
}
async function balances(rpc,token,accounts,tag){
 const values=[];
 for(const account of accounts){
  const data='0x70a08231'+account.slice(2).padStart(64,'0');
  const v=await rpc('eth_call',[{to:token,data},tag]);
  if(typeof v!=='string'||!/^0x[0-9a-fA-F]{64}$/.test(v))throw Error('invalid ERC20 balanceOf response');
  values.push(BigInt(v));
 }
 return values;
}
export async function observeErc20Deltas({rpcA,rpcB,chainId,token,accounts,before,after}){
 if(typeof rpcA!=='function'||typeof rpcB!=='function'||rpcA===rpcB)throw Error('two distinct RPC transports required');
 if(typeof chainId!=='string'||!DEC.test(chainId))throw Error('invalid chainId');
 const chain=BigInt(chainId),t=address(token,'token');
 if(!Array.isArray(accounts)||accounts.length<2||accounts.length>256)throw Error('2-256 accounts required (payer and recipients)');
 const a=accounts.map(x=>address(x,'account'));
 if(new Set(a).size!==a.length)throw Error('duplicate account');
 const parse=b=>({number:blockNumber(b?.number),hash:hash(b?.hash,'block hash')});
 const start=parse(before),end=parse(after);
 if(end.number<=start.number||start.hash===end.hash)throw Error('invalid snapshot interval');
 const observed=await Promise.all([rpcA,rpcB].map(async rpc=>{
  const pre=await snapshot(rpc,chain,start);
  const post=await snapshot(rpc,chain,end);
  const [p,q]=await Promise.all([balances(rpc,t,a,pre),balances(rpc,t,a,post)]);
  return q.map((v,i)=>v-p[i]);
 }));
 for(let i=0;i<a.length;i++)if(observed[0][i]!==observed[1][i])throw Error('RPC balance disagreement');
 const deltas=Object.fromEntries(a.map((account,i)=>[account,observed[0][i].toString()]));
 return Object.freeze({chainId,token:t,accounts:a,deltas,
  before:{number:start.number.toString(),hash:start.hash},after:{number:end.number.toString(),hash:end.hash},
  evidenceLevel:'TWO_RPC_ERC20_SNAPSHOT_DELTAS_UNATTRIBUTED',
  providerIndependenceVerified:false,workloadAttributionVerified:false,verifiedSavingsEligible:false});
}
export function compareErc20Outcomes(baseline,candidate,expected){
 if(!baseline||!candidate||baseline.evidenceLevel!=='TWO_RPC_ERC20_SNAPSHOT_DELTAS_UNATTRIBUTED'||candidate.evidenceLevel!=='TWO_RPC_ERC20_SNAPSHOT_DELTAS_UNATTRIBUTED')throw Error('observed ERC20 snapshots required');
 if(baseline.chainId!==candidate.chainId||baseline.token!==candidate.token)throw Error('chain/token mismatch');
 if(!expected||typeof expected!=='object'||Array.isArray(expected))throw Error('expected deltas required');
 const keys=Object.keys(expected).sort();
 const actual=Object.keys(baseline.deltas).sort();
 if(keys.length!==actual.length||keys.some((k,i)=>k!==actual[i])||Object.keys(candidate.deltas).sort().join()!==actual.join())throw Error('account coverage mismatch');
 for(const key of keys){
  if(typeof expected[key]!=='string'||!/^(-?(0|[1-9][0-9]*))$/.test(expected[key]))throw Error('invalid expected delta');
  if(baseline.deltas[key]!==expected[key]||candidate.deltas[key]!==expected[key])throw Error('ERC20 outcome mismatch: '+key);
 }
 return Object.freeze({equivalentObservedDeltas:true,verifiedSavingsEligible:false,
  evidenceLevel:'MATCHED_TWO_RPC_ERC20_DELTAS_NO_WORKLOAD_ATTRIBUTION'});
}
