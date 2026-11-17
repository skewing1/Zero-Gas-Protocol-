import test from 'node:test';
import assert from 'node:assert/strict';
import { preflightIntent } from './intent-preflight.mjs';

const addr = n => '0x' + n.toString(16).padStart(40, '0');
const digest = n => '0x' + n.toString(16).padStart(64, '0');
const base = () => ({
  intent: {chainId:'8453', account:addr(1), settler:addr(2), asset:'native',
    recipient:addr(3), amount:'100', nonce:'0', deadline:'200',
    calldataHash:digest(4), delegationCodeHash:digest(5)},
  context: {chainId:'8453', account:addr(1), settler:addr(2), expectedNonce:'0',
    now:'100', calldataHash:digest(4), delegationCodeHash:digest(5)}
});
test('valid envelope remains explicitly unauthorized', () => {
  const {intent, context} = base();
  const result = preflightIntent(intent, context);
  assert.equal(result.chain, 'base');
  assert.equal(result.safeToRelay, false);
  assert.equal(result.signatureVerified, false);
  assert.equal(result.rpcVerified, false);
});
for (const chainId of ['1','8453','42161']) {
  test('supports '+chainId+' only with matching context', () => {
    const {intent,context}=base(); intent.chainId=chainId; context.chainId=chainId;
    assert.equal(preflightIntent(intent,context).chainId,chainId);
  });
}
for (const [name, mutate] of [
  ['wrong chain', ({intent}) => {intent.chainId='1';}],
  ['unsupported chain', ({intent,context}) => {intent.chainId='10';context.chainId='10';}],
  ['wrong settler', ({intent}) => {intent.settler=addr(9);}],
  ['wrong account', ({intent}) => {intent.account=addr(9);}],
  ['wrong code', ({intent}) => {intent.delegationCodeHash=digest(9);}],
  ['wrong calldata', ({intent}) => {intent.calldataHash=digest(9);}],
  ['replayed nonce', ({intent}) => {intent.nonce='1';}],
  ['expired', ({intent}) => {intent.deadline='100';}],
  ['zero amount', ({intent}) => {intent.amount='0';}],
  ['negative amount', ({intent}) => {intent.amount='-1';}],
  ['unsafe number', ({intent}) => {intent.amount=100;}],
  ['leading zero', ({intent}) => {intent.nonce='00';}],
  ['uint overflow', ({intent}) => {intent.amount=(1n<<256n).toString();}],
  ['unknown field', ({intent}) => {intent.signature='0x';}],
  ['zero recipient', ({intent}) => {intent.recipient=addr(0);}],
  ['invalid asset', ({intent}) => {intent.asset='USDC';}],
  ['missing context', ({intent}) => {intent.chainId='8453';}]
]) {
  test('rejects '+name, () => {
    const fixture=base(); mutate(fixture);
    if(name==='missing context') assert.throws(()=>preflightIntent(fixture.intent,null));
    else assert.throws(()=>preflightIntent(fixture.intent,fixture.context));
  });
}
