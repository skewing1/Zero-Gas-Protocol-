import assert from 'node:assert/strict';

const wei = (value, label) => {
  assert(typeof value === 'string' && /^(0|[1-9][0-9]*)$/.test(value), `${label}: expected unsigned decimal wei string`);
  return BigInt(value);
};
const nonnegative = (value, label) => {
  assert(Number.isSafeInteger(value) && value >= 0, `${label}: expected nonnegative safe integer`);
  return value;
};

/**
 * Fail-closed all-in comparison of equivalent recipient outcomes.
 * Receipt fees are supplied from separately validated, canonical mined receipts.
 * Non-receipt costs must be evidenced independently; missing costs are never zero by default.
 * All fee values are wei on the SAME chain, or externally normalized to the same
 * currency/valuation timestamp with provenance before calling this function.
 */
export function compareAllIn({ baseline, candidate, minimumSavingsBps = 4500 }) {
  nonnegative(minimumSavingsBps, 'minimumSavingsBps');
  assert(minimumSavingsBps <= 10000, 'minimumSavingsBps exceeds 10000');
  const calculate = (strategy, name) => {
    assert(strategy && typeof strategy === 'object', `${name}: missing strategy`);
    assert(typeof strategy.chainId === 'string' && /^[1-9][0-9]*$/.test(strategy.chainId), `${name}: invalid chainId`);
    assert(typeof strategy.outcomeDigest === 'string' && /^0x[0-9a-fA-F]{64}$/.test(strategy.outcomeDigest), `${name}: missing outcome digest`);
    const payments = nonnegative(strategy.paymentCount, `${name}.paymentCount`);
    assert(payments > 0, `${name}: no payments`);
    assert(Array.isArray(strategy.receipts) && strategy.receipts.length > 0, `${name}: mined receipts required`);
    const hashes = new Set();
    let receiptWei = 0n;
    for (const [index, receipt] of strategy.receipts.entries()) {
      const label = `${name}.receipts[${index}]`;
      assert(receipt && /^0x[0-9a-fA-F]{64}$/.test(receipt.hash ?? ''), `${label}: invalid hash`);
      const hash = receipt.hash.toLowerCase();
      assert(!hashes.has(hash), `${label}: duplicate transaction receipt`);
      hashes.add(hash);
      assert(receipt.canonical === true && receipt.status === 'success', `${label}: unverified or failed receipt`);
      receiptWei += wei(receipt.feeWei, `${label}.feeWei`);
    }
    const costs = strategy.additionalCosts;
    assert(costs && typeof costs === 'object', `${name}: additional costs missing`);
    const required = ['relayerWei', 'dataWei', 'settlementWei', 'deploymentWei', 'prefundingWei', 'otherWei'];
    const additional = Object.fromEntries(required.map(key => [key, wei(costs[key], `${name}.${key}`)]));
    const extraWei = Object.values(additional).reduce((a, b) => a + b, 0n);
    return { chainId: strategy.chainId, digest: strategy.outcomeDigest.toLowerCase(), payments, hashes, receiptWei, extraWei, totalWei: receiptWei + extraWei };
  };
  const b = calculate(baseline, 'baseline');
  const c = calculate(candidate, 'candidate');
  assert(b.chainId === c.chainId, 'Cross-chain costs require explicit currency normalization; comparison rejected');
  assert(b.digest === c.digest && b.payments === c.payments, 'Recipient outcomes or payment counts differ');
  for (const hash of b.hashes) assert(!c.hashes.has(hash), 'Receipt reused across strategies');
  assert(b.totalWei > 0n, 'Baseline all-in cost must be positive');
  const savedWei = b.totalWei - c.totalWei;
  const savingsBps = savedWei * 10000n / b.totalWei;
  return {
    chainId: b.chainId, paymentCount: b.payments, outcomeDigest: b.digest,
    baseline: { receiptWei: b.receiptWei.toString(), additionalWei: b.extraWei.toString(), totalWei: b.totalWei.toString() },
    candidate: { receiptWei: c.receiptWei.toString(), additionalWei: c.extraWei.toString(), totalWei: c.totalWei.toString() },
    savedWei: savedWei.toString(), savingsBps: savingsBps.toString(),
    meetsTarget: savingsBps >= BigInt(minimumSavingsBps),
    evidenceScope: 'arithmetic-only; requires independently verified mined receipts, outcome digest, and cost inputs',
  };
}
