// Offline consistency check only. Authenticate RPC block hashes, balances and finality separately.
const uint=(v,n)=>{if(typeof v!=='string'||!/^(0|[1-9][0-9]*)$/.test(v))throw Error(n+' must be a canonical decimal uint');return BigInt(v)};
const address=(v,n)=>{if(typeof v!=='string'||!/^0x[0-9a-fA-F]{40}$/.test(v))throw Error('Invalid '+n);return v.toLowerCase()};
const asset=v=>v==='native'?'native':address(v,'asset');
function parse(s,label){
 if(!s||!Array.isArray(s.balances)||!s.balances.length)throw Error('Missing '+label+' balances');
 const chainId=uint(s.chainId,label+'.chainId'),blockNumber=uint(s.blockNumber,label+'.blockNumber');
 if(!chainId)throw Error('Zero chainId');
 if(typeof s.blockHash!=='string'||!/^0x[0-9a-fA-F]{64}$/.test(s.blockHash))throw Error('Invalid blockHash');
 const balances=new Map();
 for(const x of s.balances){const key=address(x.recipient,'recipient')+':'+asset(x.asset);if(balances.has(key))throw Error('Duplicate '+label+' balance key');balances.set(key,uint(x.balanceWei,label+'.balanceWei'))}
 return {chainId,blockNumber,blockHash:s.blockHash.toLowerCase(),balances};
}
export function verifySnapshotOutcomes(path,before,after){
 const a=parse(before,'before'),b=parse(after,'after');
 if(a.chainId!==b.chainId||a.chainId!==uint(path?.chainId,'path.chainId'))throw Error('Snapshot chain mismatch');
 if(b.blockNumber<=a.blockNumber||b.blockHash===a.blockHash)throw Error('Snapshots must span distinct ordered blocks');
 if(!Array.isArray(path.outcome)||!path.outcome.length)throw Error('Missing declared outcomes');
 const declared=new Map();
 for(const x of path.outcome){const key=address(x.recipient,'recipient')+':'+asset(x.asset);if(declared.has(key))throw Error('Duplicate declared outcome');const amount=uint(x.deltaWei,'deltaWei');if(!amount)throw Error('Zero declared payment');declared.set(key,amount)}
 if(a.balances.size!==declared.size||b.balances.size!==declared.size)throw Error('Snapshot coverage differs from declared outcomes');
 for(const [key,expected] of declared){if(!a.balances.has(key)||!b.balances.has(key))throw Error('Missing snapshot balance');if(b.balances.get(key)-a.balances.get(key)!==expected)throw Error('Recipient balance delta does not match declared outcome')}
 return {chainId:a.chainId.toString(),beforeBlockHash:a.blockHash,afterBlockHash:b.blockHash,checkedRecipients:declared.size,verifiedScope:'Arithmetic consistency of supplied snapshots only; RPC authenticity and finality not established'};
}
