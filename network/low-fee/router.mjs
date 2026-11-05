// Selection policy over fresh adapter observations. This module never moves funds.
// Circle's USDC list, checked 2026-11-05. Copies/bridged representations are not aliases.
export const usdcByChain = Object.freeze({
  1: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
  8453: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
  42220: '0xceba9300f2b948710d2653dd7b07f33a8b32118c',
  84532: '0x036cbd53842c5426634e7929541ec2318f3dcf7e',
  11142220: '0x01c5c0122039549ad1493b8220cabedd739bc44e',
});
const address = /^0x[0-9a-f]{40}$/i;
const same = (a,b) => typeof a === 'string' && typeof b === 'string' && a.toLowerCase() === b.toLowerCase();
const parts = ['execution', 'data', 'operator', 'setup', 'bridge', 'liquidity', 'relayer', 'exit'];
const nonnegative = n => typeof n === 'bigint' && n >= 0n;

export function selectDirectRoute(request, observations, now = Math.floor(Date.now()/1000)) {
  if (!address.test(request.payer) || !address.test(request.payee) || BigInt(request.payer) === 0n || BigInt(request.payee) === 0n || same(request.payer,request.payee)) throw new Error('Invalid transactor addresses');
  if (request.asset !== 'circle:USDC' || typeof request.amount !== 'bigint' || request.amount <= 0n || request.amount >= 2n ** 256n || !Array.isArray(request.acceptedChains) || !nonnegative(request.maxEstimatedFeeMicroUsd)) throw new Error('Invalid routing request');
  const eligible = [], rejected = [];
  for (const observation of observations) {
    const fail = reason => rejected.push({ chainId: observation.chainId, reason });
    if (observation.error) { fail('RPC_OR_ADAPTER_ERROR'); continue; }
    if (observation.kind !== 'direct' || observation.sourceChainId !== observation.chainId || observation.destinationChainId !== observation.chainId) { fail('CROSS_CHAIN_ROUTE_NOT_IMPLEMENTED'); continue; }
    if (!request.acceptedChains.includes(observation.chainId)) { fail('RECIPIENT_DOES_NOT_ACCEPT_CHAIN'); continue; }
    if (!same(observation.token,usdcByChain[observation.chainId]) || observation.asset !== request.asset || observation.assetCodeVerified !== true) { fail('UNVERIFIED_ASSET'); continue; }
    if (!same(observation.payer,request.payer) || !same(observation.payee,request.payee) || observation.amount !== request.amount) { fail('DIFFERENT_TRANSFER'); continue; }
    if (!Number.isSafeInteger(observation.observedAt) || observation.observedAt > now || now-observation.observedAt > 120) { fail('STALE_QUOTE'); continue; }
    if (observation.costUnit !== 'microUSD-estimate' || parts.some(part=>!nonnegative(observation.costs?.[part]))) { fail('INCOMPLETE_OR_INCOMPARABLE_COST'); continue; }
    if (!nonnegative(observation.tokenBalance) || !nonnegative(observation.tokenFeeReserve) || observation.tokenBalance < request.amount + observation.tokenFeeReserve) { fail('INSUFFICIENT_TOKEN_FUNDS_ON_CHAIN'); continue; }
    if (!nonnegative(observation.nativeBalance) || !nonnegative(observation.nativeFeeReserve) || observation.nativeBalance < observation.nativeFeeReserve) { fail('INSUFFICIENT_NATIVE_GAS_ON_CHAIN'); continue; }
    const totalEstimatedFeeMicroUsd=parts.reduce((sum,part)=>sum+observation.costs[part],0n);
    if (totalEstimatedFeeMicroUsd > request.maxEstimatedFeeMicroUsd) { fail('ABOVE_USER_FEE_BUDGET'); continue; }
    eligible.push({...observation,totalEstimatedFeeMicroUsd});
  }
  eligible.sort((a,b)=>a.totalEstimatedFeeMicroUsd<b.totalEstimatedFeeMicroUsd?-1:a.totalEstimatedFeeMicroUsd>b.totalEstimatedFeeMicroUsd?1:a.chainId-b.chainId);
  return { selected: eligible[0] ?? null, alternatives: eligible.slice(1), rejected,
    scope:'Already-funded, recipient-accepted direct routes only. Estimates require refresh before signing.' };
}

// Conditional arithmetic over supplied costs; never labels projections as measured savings.
export function evaluateChainMove({ directPerPayment, destinationPerPayment, entry, exit, payments, equivalentOutcome }) {
  if (equivalentOutcome !== true) return { status:'NOT_COMPARABLE' };
  if ([directPerPayment,destinationPerPayment,entry,exit].some(n=>!nonnegative(n)) || typeof payments!=='bigint' || payments<1n) return { status:'MISSING_COST_OR_VOLUME' };
  if(directPerPayment===0n)return {status:'ZERO_COST_BASELINE'};
  const upfront=entry+exit;
  const ceil=(a,b)=>(a+b-1n)/b;
  const requiredFor = percent => {
    const denominator=directPerPayment*(100n-percent)-100n*destinationPerPayment;
    if(denominator<0n||denominator===0n&&upfront>0n)return null;
    if(denominator===0n)return 1n;
    const n=ceil(100n*upfront,denominator);
    return n<1n?1n:n;
  };
  const difference=directPerPayment-destinationPerPayment;
  const breakEven=difference>0n ? (ceil(upfront,difference)||1n) : difference===0n&&upfront===0n?1n:null;
  const directTotal=payments*directPerPayment;
  const movedTotal=upfront+payments*destinationPerPayment;
  return { status:'CONDITIONAL_COST_COMPARISON',directTotal,movedTotal,entryAndExit:upfront,
    cheaper:movedTotal<directTotal, breakEvenPayments:breakEven,
    minimumFor90:requiredFor(90n),minimumFor99:requiredFor(99n),
    note:'Requires verified equivalent outcomes and complete entry/exit costs. Future fees and volume are assumptions, not measurements.' };
}
