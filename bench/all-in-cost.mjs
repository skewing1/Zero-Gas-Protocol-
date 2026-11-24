// All monetary inputs are nonnegative wei strings; no estimates are silently treated as zero.
const FIELDS = ['executionWei','dataWei','authorizationWei','relayerWei','settlementWei','deploymentWei','crossChainWei'];
export function totalCost(path) {
  if (!path || typeof path !== 'object') throw Error('Missing cost path');
  let total = 0n;
  for (const field of FIELDS) {
    const value = path[field];
    if (typeof value !== 'string' || !/^(0|[1-9][0-9]*)$/.test(value)) throw Error('Missing or invalid ' + field);
    total += BigInt(value);
  }
  return total;
}
export function compareEquivalentPayments(baseline, optimized) {
  for (const p of [baseline, optimized]) {
    if (!p || p.outcomeVerified !== true || p.receiptsVerified !== true || p.finalityVerified !== true) throw Error('Unverified receipts, finality or outcome');
    if (typeof p.outcomeDigest !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(p.outcomeDigest)) throw Error('Invalid outcome digest');
    if (!Number.isSafeInteger(p.paymentCount) || p.paymentCount <= 0) throw Error('Invalid payment count');
  }
  if (baseline.outcomeDigest.toLowerCase() !== optimized.outcomeDigest.toLowerCase() || baseline.paymentCount !== optimized.paymentCount) throw Error('Non-equivalent outcomes');
  const base = totalCost(baseline), opt = totalCost(optimized);
  if (base === 0n) throw Error('Zero baseline cost');
  const delta = base - opt;
  // Basis points, truncation toward zero; negative means optimized is more expensive.
  const savingsBps = delta * 10000n / base;
  return {baselineWei:base.toString(),optimizedWei:opt.toString(),differenceWei:delta.toString(),savingsBps:savingsBps.toString(),above45Percent:savingsBps>4500n, paymentCount:baseline.paymentCount};
}
