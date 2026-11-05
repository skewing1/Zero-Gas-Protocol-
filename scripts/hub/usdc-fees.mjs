import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { encodeFunctionData, decodeFunctionData, parseAbi, keccak256, toHex } from '../../node/node_modules/viem/_esm/index.js';
import { operatorFee } from '../../network/checkout/rollup-fees.mjs';
import { celoUsdc, quoteUsdc, parseUsdc } from '../../network/low-fee/celo-usdc.mjs';

const abi = parseAbi(['function transfer(address,uint256) returns (bool)', 'function balanceOf(address) view returns (uint256)']);
const topic = keccak256(toHex('Transfer(address,address,uint256)'));
const same = (a,b) => a?.toLowerCase() === b?.toLowerCase();
const addressTopic = a => '0x' + a.slice(2).toLowerCase().padStart(64, '0');
const hex = n => '0x' + n.toString(16);
const networks = [
  { name: 'Ethereum', chainId: 1, rpc: process.env.ETHEREUM_RPC_URL ?? 'https://ethereum-rpc.publicnode.com', token: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', mode: 'native-ETH' },
  { name: 'Base', chainId: 8453, rpc: process.env.BASE_RPC_URL ?? 'https://base-rpc.publicnode.com', token: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', mode: 'native-ETH' },
  { name: 'Celo', chainId: 42220, rpc: process.env.CELO_RPC_URL ?? celoUsdc[42220].rpc, token: celoUsdc[42220].token, mode: 'USDC-gas' },
];
const allowed = new Set(['eth_chainId','eth_getBlockByNumber','eth_getTransactionReceipt','eth_getTransactionByHash','eth_getCode','eth_call','eth_getLogs','eth_getBalance','eth_getTransactionCount','eth_gasPrice','eth_maxPriorityFeePerGas','eth_estimateGas']);
const median = values => { const s=[...values].sort((a,b)=>a<b?-1:a>b?1:0);return s.length%2?s[s.length>>1]:(s[s.length/2-1]+s[s.length/2])/2n; };
let sequence=0;
function reader(url, timeout=180_000) {
  const start=Date.now();
  return async (method,...params) => {
    assert(allowed.has(method),'Read-only RPC guard');
    assert(Date.now()-start<timeout,'Sampling time budget exhausted');
    const response=await fetch(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:++sequence,method,params}),signal:AbortSignal.timeout(12_000)});
    const payload=await response.json();
    if(!response.ok||payload.error)throw new Error(`${method}: ${payload.error?.message ?? response.status}`);
    return payload.result;
  };
}
async function sample(config) {
  const result={...config,rpc:new URL(config.rpc).origin,samples:[]};
  const rpc=reader(config.rpc);
  const balance=async (owner, block)=>BigInt(await rpc('eth_call',{to:config.token,data:encodeFunctionData({abi,functionName:'balanceOf',args:[owner]})},block));
  try {
    assert.equal(BigInt(await rpc('eth_chainId')),BigInt(config.chainId));
    assert.notEqual(await rpc('eth_getCode',config.token,'latest'),'0x','Missing Circle token code');
    const head=await rpc('eth_getBlockByNumber','finalized',false);
    assert(head?.hash,'Finalized head unavailable');result.head=head;
    let numbers=Array.from({length:128},(_,offset)=>hex(BigInt(head.number)-BigInt(offset)));
    if(config.chainId===42220) {
      // Fee-in-USDC transfers are sparse: discover their blocks from token logs.
      const logs=await rpc('eth_getLogs',{address:config.token,fromBlock:hex(BigInt(head.number)-4999n),toBlock:head.number,topics:[topic]});
      const hashes=[...new Set(logs.map(log=>log.transactionHash))].reverse().slice(0,1000);
      const selected=new Set();
      for(let offset=0;offset<hashes.length&&selected.size<12;offset+=20) {
        const transactions=await Promise.all(hashes.slice(offset,offset+20).map(hash=>rpc('eth_getTransactionByHash',hash)));
        for(const tx of transactions)if(tx?.type==='0x7b'&&same(tx.feeCurrency,celoUsdc[42220].adapter)&&same(tx.to,config.token)&&tx.input?.startsWith('0xa9059cbb')&&tx.input.length===138)selected.add(tx.blockNumber);
      }
      numbers=[...selected];
      result.discovery={blocks:5000,tokenLogCount:logs.length,transactionCandidates:hashes.length,matchingBlocks:numbers.length};
    }
    for(const number of numbers) {
      if(result.samples.length>=3)break;
      const block=await rpc('eth_getBlockByNumber',number,true);
      const candidates=block.transactions.filter(tx=>same(tx.to,config.token)&&tx.input?.startsWith('0xa9059cbb')&&tx.input.length===138&&BigInt(tx.value)===0n&&(config.chainId!==42220||(tx.type==='0x7b'&&same(tx.feeCurrency,celoUsdc[42220].adapter))));
      for(const tx of candidates.slice(0,8)) {
        const {args:[payee,amount]}=decodeFunctionData({abi,data:tx.input});
        if(amount===0n||same(payee,tx.from))continue;
        const receipt=await rpc('eth_getTransactionReceipt',tx.hash);
        if(receipt?.status!=='0x1'||receipt.blockHash!==block.hash)continue;
        if(await rpc('eth_getCode',payee,number)!=='0x')continue;
        const transfers=receipt.logs.filter(log=>same(log.address,config.token)&&log.topics[0]===topic&&same(log.topics[1],addressTopic(tx.from))&&same(log.topics[2],addressTopic(payee))&&BigInt(log.data)===amount);
        if(transfers.length!==1)continue;
        const prior=hex(BigInt(number)-1n);
        const priorRecipientBalance=await balance(payee,prior);
        const row={tx,receipt,blockTimestamp:block.timestamp,payee,amount:amount.toString(),priorRecipientBalance:priorRecipientBalance.toString(),category:priorRecipientBalance===0n?'zero-token-balance':'existing-token-balance'};
        if(config.chainId===42220) {
          if(block.transactions.filter(other=>same(other.from,tx.from)).length!==1)continue;
          const [out,incoming]=await Promise.all([
            rpc('eth_getLogs',{address:config.token,fromBlock:number,toBlock:number,topics:[topic,addressTopic(tx.from)]}),
            rpc('eth_getLogs',{address:config.token,fromBlock:number,toBlock:number,topics:[topic,null,addressTopic(tx.from)]}),
          ]);
          if([...out,...incoming].some(log=>log.transactionHash!==tx.hash))continue;
          const [before,after,nativeBefore,nativeAfter]=await Promise.all([balance(tx.from,prior),balance(tx.from,number),rpc('eth_getBalance',tx.from,prior),rpc('eth_getBalance',tx.from,number)]);
          const fee=before-after-amount;
          assert(fee>=0n,'Negative reconciled fee');
          const code=await rpc('eth_getCode',tx.from,prior);
          assert.equal(code,'0x','Sender must be ordinary EOA');
          Object.assign(row,{feeMicroUsdc:fee.toString(),senderBalanceBefore:before.toString(),senderBalanceAfter:after.toString(),nativeBefore,nativeAfter,zeroNativeBeforeAndAfter:BigInt(nativeBefore)===0n&&BigInt(nativeAfter)===0n,relatedLogs:[...out,...incoming]});
        } else {
          let data=0n,operator=0n;
          if(config.chainId===8453) {assert(receipt.l1Fee!==undefined,'Missing L1 fee');data=BigInt(receipt.l1Fee);operator=receipt.operatorFee!==undefined?BigInt(receipt.operatorFee):await operatorFee(rpc,BigInt(receipt.gasUsed),number);}
          Object.assign(row,{feeWei:(BigInt(receipt.gasUsed)*BigInt(receipt.effectiveGasPrice)+data+operator).toString(),l1Fee:data.toString(),operatorFee:operator.toString()});
        }
        result.samples.push(row);
        if(result.samples.length===3)break;
      }
    }
    result.status=result.samples.length===3?'MEASURED':'PARTIAL';
    if(config.chainId===42220&&result.samples.length) {
      for(const row of result.samples) {
        if(BigInt(row.senderBalanceAfter)<parseUsdc('0.02'))continue;
        try {result.liveQuote=await quoteUsdc(reader(config.rpc,60_000),{chainId:42220,sender:row.tx.from,recipient:'0x000000000000000000000000000000000000bEEF',amount:parseUsdc('0.01'),maxFee:parseUsdc('0.01')});break;}
        catch(e){result.quoteError=e.message;}
      }
      if(result.liveQuote)delete result.quoteError;
    }
  }catch(e){result.status='INCOMPLETE';result.error=e.message;}
  console.log(`${config.name}: ${result.status}, ${result.samples.length} samples${result.error?' — '+result.error:''}`);
  return result;
}
const replay=process.argv.find(arg=>arg.startsWith('--from-snapshot='))?.split('=')[1];
const snapshot=replay?JSON.parse(readFileSync(replay,'utf8')):undefined;
const startedAt=snapshot?.startedAt??new Date().toISOString();
const results=snapshot?.results??await Promise.all(networks.map(sample));
let price=snapshot?.price;
if(!snapshot)try {const r=await fetch('https://coins.llama.fi/prices/current/coingecko:ethereum',{signal:AbortSignal.timeout(12_000)});assert(r.ok);price=(await r.json()).coins['coingecko:ethereum'];}catch{}
const rows=[];
for(const network of results)for(const category of ['zero-token-balance','existing-token-balance']){
  const samples=network.samples.filter(row=>row.category===category);
  if(!samples.length)continue;
  const isUsdc=network.chainId===42220;
  const cost=median(samples.map(row=>BigInt(isUsdc?row.feeMicroUsdc:row.feeWei)));
  rows.push({chainId:network.chainId,network:network.name,category,samples:samples.length,cost:cost.toString(),unit:isUsdc?'micro-USDC':'wei',approxUsd:isUsdc?Number(cost)/1e6:price?Number(cost)/1e18*price.price:undefined});
}
const report=[
  '# Same-asset direct USDC fee evidence','',`Read-only observation started ${startedAt}. Circle-issued USDC only. No public-network transaction was signed or sent. Target: three successful direct transfers per chain; at most 128 finalized blocks for Ethereum/Base and a 5,000-block token-log window for sparse Celo USDC-fee transfers; 180 seconds per chain.`,
  'Celo rows use USDC for gas. Their fees are reconciled from the sender’s actual token balance change minus the exact payment, excluding blocks with other USDC transfers involving that sender. Native balances before/after are retained. Ethereum and Base rows use receipt fees, including Base L1 data and operator charges.','',
  '| Network | Recipient token state | Samples | Median network fee | Approx. USD |',
  '| --- | --- | ---: | ---: | ---: |',
  ...rows.map(r=>`| ${r.network} | ${r.category} | ${r.samples} | ${r.cost} ${r.unit} | ${r.approxUsd===undefined?'UNPRICED':'$'+r.approxUsd.toFixed(8)} |`),'',
  ...results.map(r=>`- ${r.name}: ${r.status}${r.error?' — '+r.error:''}. ${r.chainId===42220?`${r.samples.filter(s=>s.zeroNativeBeforeAndAfter).length}/${r.samples.length} sampled senders had zero native CELO before and after the payment. Live SDK quote: ${r.liveQuote?'SIMULATED':r.quoteError??'not attempted'}.`:''}`),'',
  `ETH/USD quote timestamp: ${price?.timestamp?new Date(price.timestamp*1000).toISOString():'unavailable'}.`, '',
  'USD for ETH-paid gas is a separately timestamped price conversion. USDC amounts are token units, not a guarantee of a dollar redemption rate. Samples are small and can be clustered; recipient storage states are separated.','',
  'This is an already-funded, same-asset payment route. Entry, swaps, bridges, exit and ongoing platform operating cost are unmeasured. Full lifecycle 90%/99% gates remain NOT MEASURED. The SDK is an unsigned quote builder; a real CIP-64 wallet flow has not been tested. No fees are subsidized in the reported receipt totals.','',
  'Sources: https://developers.circle.com/stablecoins/usdc-contract-addresses ; https://docs.celo.org/build/tools/contracts/fee-currencies ; https://docs.celo.org/operate/specification/transaction-fees ; https://docs.celo.org/build/fee-abstraction/using-fee-abstraction','',
].join('\n');
mkdirSync('bench',{recursive:true});
const raw=JSON.stringify({startedAt,finishedAt:snapshot?.finishedAt??new Date().toISOString(),price,results,rows},null,2);
writeFileSync('bench/usdc-fees.json',raw);writeFileSync('bench/usdc-fees.json.gz',gzipSync(raw));writeFileSync('bench/usdc-fees.md',report);console.log(report);
