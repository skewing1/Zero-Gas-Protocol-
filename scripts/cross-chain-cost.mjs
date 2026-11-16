// Independent, fail-closed cross-chain cost normalization.
// Inputs are observed costs and explicit contemporaneous native-token USD quotes.
// This module does not verify RPC receipts, quotes, or outcome equivalence.
const decimal = (value, name) => {
  if (typeof value !== 'string' || !/^(0|[1-9][0-9]*)(\.[0-9]+)?$/.test(value))
    throw new Error(name + ' must be a nonnegative decimal string');
  const [whole, fraction = ''] = value.split('.');
  return { numerator: BigInt(whole + fraction), denominator: 10n ** BigInt(fraction.length) };
};
const integer = (value, name) => {
  if (typeof value !== 'string' || !/^(0|[1-9][0-9]*)$/.test(value))
    throw new Error(name + ' must be a nonnegative integer string');
  return BigInt(value);
};
const ceilDiv = (a, b) => (a + b - 1n) / b;
const REQUIRED = ['settlementWei', 'prefundWei', 'deploymentWei', 'relayerUsd', 'dataUsd', 'proofUsd', 'bridgeUsd', 'infrastructureUsd'];
export function normalizePath(path) {
  if (!path || typeof path !== 'object' || Array.isArray(path)) throw new Error('path object required');
  for (const key of ['chainId', 'nativeUsd', 'quoteTimestamp', 'outcomeDigest', ...REQUIRED])
    if (path[key] === undefined || path[key] === null) throw new Error('missing ' + key);
  const chainId = integer(path.chainId, 'chainId');
  if (chainId === 0n) throw new Error('invalid chainId');
  if (typeof path.quoteTimestamp !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z$/.test(path.quoteTimestamp) || !Number.isFinite(Date.parse(path.quoteTimestamp)))
    throw new Error('invalid quoteTimestamp');
  if (typeof path.outcomeDigest !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(path.outcomeDigest)) throw new Error('invalid outcomeDigest');
  const price = decimal(path.nativeUsd, 'nativeUsd');
  if (price.numerator === 0n) throw new Error('nativeUsd must be positive');
  const wei = ['settlementWei', 'prefundWei', 'deploymentWei'].reduce((s, k) => s + integer(path[k], k), 0n);
  // Costs in millionths of USD, rounded UP per category to avoid understating.
  const onchainMicroUsd = ceilDiv(wei * price.numerator * 1000000n, 10n ** 18n * price.denominator);
  const offchainMicroUsd = ['relayerUsd', 'dataUsd', 'proofUsd', 'bridgeUsd', 'infrastructureUsd']
    .reduce((s, k) => { const d = decimal(path[k], k); return s + ceilDiv(d.numerator * 1000000n, d.denominator); }, 0n);
  return { chainId: chainId.toString(), quoteTimestamp: path.quoteTimestamp, outcomeDigest: path.outcomeDigest.toLowerCase(),
    onchainMicroUsd: onchainMicroUsd.toString(), offchainMicroUsd: offchainMicroUsd.toString(),
    totalMicroUsd: (onchainMicroUsd + offchainMicroUsd).toString(), evidenceClass: 'unverified-cost-inputs' };
}
export function comparePaths(baseline, candidate) {
  const a = normalizePath(baseline), b = normalizePath(candidate);
  if (a.outcomeDigest !== b.outcomeDigest) throw new Error('outcomes differ');
  if (a.quoteTimestamp !== b.quoteTimestamp) throw new Error('quotes must share timestamp');
  const totalA = BigInt(a.totalMicroUsd), totalB = BigInt(b.totalMicroUsd);
  if (totalA === 0n) throw new Error('zero baseline cost');
  const savingsBps = ((totalA - totalB) * 10000n) / totalA;
  return { baseline: a, candidate: b, savingsBps: savingsBps.toString(),
    exceeds45Percent: savingsBps > 4500n, verified: false,
    note: 'Scenario only. Receipt authenticity, equivalent outcomes, quote provenance and off-chain expenses require independent verification.' };
}
