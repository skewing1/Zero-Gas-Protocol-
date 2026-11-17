import test from 'node:test';
import assert from 'node:assert/strict';
import { compareEquivalentPaths } from './independent-payer-cost-gate.mjs';
const alice = '0x' + '11'.repeat(20), bob = '0x' + '22'.repeat(20), payee = '0x' + '33'.repeat(20);
function path(gasUsed = '100', relayerWei = '0') {
  return {
    chainId: 31337, asset: 'native', window: 'epoch-1', evidence: 'unverified',
    payerDebits: [{ address: alice, deltaWei: '7' }, { address: bob, deltaWei: '3' }],
    recipientCredits: [{ address: payee, deltaWei: '10' }],
    receipts: [{ hash: '0x' + 'ab'.repeat(32), chainId: 31337, status: '0x1',
      gasUsed, effectiveGasPrice: '1', totalFeeWei: gasUsed }],
    operatingCosts: { relayerWei, proofWei: '0', infrastructureWei: '0', bridgeWei: '0', settlementWei: '0' }
  };
}
test('equivalent independent payers, 50% synthetic savings not verified', () => {
  const baseline = path('100'), candidate = path('50');
  const result = compareEquivalentPaths(baseline, candidate);
  assert.equal(result.savingsBps, '5000');
  assert.equal(result.meets45Percent, true);
  assert.equal(result.verified, false);
});
test('relayer expense reverses apparent savings', () => {
  const result = compareEquivalentPaths(path('100'), path('50', '60'));
  assert.equal(result.meets45Percent, false);
  assert.equal(result.savingsBps, '-1000');
});
test('reject unequal payer principal even with matching recipients', () => {
  const candidate = path('50'); candidate.payerDebits[1].deltaWei = '4';
  assert.throws(() => compareEquivalentPaths(path(), candidate), /unequal balance delta/);
});
test('reject unequal recipient outcome', () => {
  const candidate = path('50'); candidate.recipientCredits[0].deltaWei = '11';
  assert.throws(() => compareEquivalentPaths(path(), candidate), /unequal balance delta/);
});
test('reject different chain even if cheaper', () => {
  const candidate = path('50'); candidate.chainId = 8453; candidate.receipts[0].chainId = 8453;
  assert.throws(() => compareEquivalentPaths(path(), candidate), /cross-chain/);
});
test('reject failed receipts', () => {
  const candidate = path('50'); candidate.receipts[0].status = '0x0';
  assert.throws(() => compareEquivalentPaths(path(), candidate), /status/);
});
test('reject duplicate hashes', () => {
  const candidate = path('50'); candidate.receipts.push({ ...candidate.receipts[0] });
  assert.throws(() => compareEquivalentPaths(path(), candidate), /duplicate hash/);
});
test('reject omitted offchain costs', () => {
  const candidate = path('50'); delete candidate.operatingCosts.bridgeWei;
  assert.throws(() => compareEquivalentPaths(path(), candidate), /missing bridgeWei/);
});
test('reject fee mismatch', () => {
  const candidate = path('50'); candidate.receipts[0].totalFeeWei = '49';
  assert.throws(() => compareEquivalentPaths(path(), candidate), /fee mismatch/);
});
test('reject noncanonical negative and fractional costs', () => {
  for (const invalid of ['-1', '1.2', '01']) {
    const candidate = path('50', invalid);
    assert.throws(() => compareEquivalentPaths(path(), candidate), /canonical unsigned/);
  }
});
test('reject duplicated payer addresses', () => {
  const candidate = path('50'); candidate.payerDebits.push({ address: alice.toUpperCase().replace('0X', '0x'), deltaWei: '1' });
  assert.throws(() => compareEquivalentPaths(path(), candidate), /duplicate address/);
});
