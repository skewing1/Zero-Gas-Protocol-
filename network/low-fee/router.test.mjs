import assert from 'node:assert/strict';
import test from 'node:test';
import { selectDirectRoute, usdcByChain } from './router.mjs';
// Synthetic policy vectors: these values are not network measurements.
const now=1000;
const request={payer:'0x'+'1'.repeat(40),payee:'0x'+'2'.repeat(40),asset:'circle:USDC',amount:1_000_000n,acceptedChains:[8453,42220],maxEstimatedFeeMicroUsd:10_000n};
const quote=(chainId,cost)=>({kind:'direct',chainId,sourceChainId:chainId,destinationChainId:chainId,token:usdcByChain[chainId],asset:request.asset,assetCodeVerified:true,payer:request.payer,payee:request.payee,amount:request.amount,observedAt:now,tokenBalance:2_000_000n,tokenFeeReserve:0n,nativeBalance:10n,nativeFeeReserve:1n,costUnit:'microUSD-estimate',costs:{execution:cost,data:0n,operator:0n,setup:0n,bridge:0n,liquidity:0n,relayer:0n,exit:0n}});

test('selects by complete cost rather than execution gas and returns the alternatives',()=>{
  const base=quote(8453,1n);base.costs.data=3000n;
  const celo=quote(42220,2000n);
  const result=selectDirectRoute(request,[base,celo],now);
  assert.equal(result.selected.chainId,42220);assert.equal(result.alternatives[0].totalEstimatedFeeMicroUsd,3001n);
});

test('does not move funds or substitute another chain, token or transfer',()=>{
  for(const [update,reason] of [
    [{tokenBalance:0n},'INSUFFICIENT_TOKEN_FUNDS_ON_CHAIN'],
    [{nativeBalance:0n},'INSUFFICIENT_NATIVE_GAS_ON_CHAIN'],
    [{sourceChainId:1},'CROSS_CHAIN_ROUTE_NOT_IMPLEMENTED'],
    [{token:'0x'+'3'.repeat(40)},'UNVERIFIED_ASSET'],
    [{payee:'0x'+'3'.repeat(40)},'DIFFERENT_TRANSFER'],
    [{observedAt:0},'STALE_QUOTE'],
    [{costs:{execution:0n}},'INCOMPLETE_OR_INCOMPARABLE_COST'],
  ]) {
    const result=selectDirectRoute(request,[{...quote(8453,1n),...update}],now);
    assert.equal(result.selected,null);assert.equal(result.rejected[0].reason,reason);
  }
});

test('USDC-paid gas can qualify with zero native balance but needs the whole token fee reserve',()=>{
  const celo={...quote(42220,2000n),nativeBalance:0n,nativeFeeReserve:0n,tokenFeeReserve:7000n};
  assert.equal(selectDirectRoute(request,[celo],now).selected.chainId,42220);
  assert.equal(selectDirectRoute(request,[{...celo,tokenBalance:request.amount}],now).selected,null);
});

test('recipient policy and user fee budget override the cheapest advertised route',()=>{
  assert.equal(selectDirectRoute({...request,acceptedChains:[1]},[quote(42220,1n)],now).rejected[0].reason,'RECIPIENT_DOES_NOT_ACCEPT_CHAIN');
  assert.equal(selectDirectRoute(request,[quote(8453,10_001n)],now).rejected[0].reason,'ABOVE_USER_FEE_BUDGET');
});

test('a bridge must repay entry AND exit; 99% can be unattainable even on a cheaper chain', async ()=>{
  const {evaluateChainMove}=await import('./router.mjs');
  const inputs={directPerPayment:1000n,destinationPerPayment:10n,entry:200n,exit:100n,payments:1n,equivalentOutcome:true};
  const result=evaluateChainMove(inputs);
  assert.equal(result.movedTotal,310n);assert.equal(result.minimumFor90,4n);assert.equal(result.minimumFor99,null);
  assert.equal(evaluateChainMove({...inputs,entry:1000n}).cheaper,false);
  assert.equal(evaluateChainMove({...inputs,exit:null}).status,'MISSING_COST_OR_VOLUME');
  assert.equal(evaluateChainMove({...inputs,equivalentOutcome:false}).status,'NOT_COMPARABLE');
});
