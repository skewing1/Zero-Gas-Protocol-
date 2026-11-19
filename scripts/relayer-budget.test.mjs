import test from 'node:test';
import assert from 'node:assert/strict';
import { relayerBudget } from './relayer-budget.mjs';
const h = n => '0x' + n.toString(16).padStart(64,'0');
function fixture(b,c) {
 const side=(n,id)=>({chainId:'1',outcomeDigest:h(99),receipts:[{transactionHash:h(id),canonical:true,success:true,executionWei:String(n),blobWei:'0',dataWei:'0'}],relayerWei:'0',deploymentWei:'0',settlementWei:'0',bridgeWei:'0'});
 return {baseline:side(b,1),candidate:side(c,2)};
}
test('strict 45 percent boundary excludes equality',()=>{
 const x=relayerBudget(fixture(10000,5499));
 assert.equal(x.maxAdditionalRelayerWei,'0');
 assert.equal(x.targetAlreadyMissed,false);
 assert.equal(x.meetsTarget,true);
 const y=relayerBudget(fixture(10000,5500));
 assert.equal(y.targetAlreadyMissed,true);
 assert.equal(y.meetsTarget,false);
});
test('maximum additional charge passes but one wei more fails',()=>{
 const x=relayerBudget(fixture(10000,1000));
 assert.equal(x.maxAdditionalRelayerWei,'4499');
 const y=relayerBudget(fixture(10000,5499));
 assert.equal(y.meetsTarget,true);
});
test('large integer inputs preserve precision',()=>{
 const b=10n**35n;
 const x=relayerBudget(fixture(b,1));
 assert.equal(BigInt(x.maxAdditionalRelayerWei), (55n*b/100n)-2n);
});
test('incomplete receipt evidence fails closed',()=>{
 const f=fixture(10000,1000);
 delete f.candidate.receipts[0].dataWei;
 assert.throws(()=>relayerBudget(f),/dataWei/);
});
