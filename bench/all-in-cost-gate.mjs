// All amounts are integer wei. No price estimates or inferred missing fees.
const wei = (value, field) => {
  if (typeof value !== 'string' || !/^(0|[1-9][0-9]*)$/.test(value))
    throw new Error(field + ' must be an unsigned decimal wei string');
  return BigInt(value);
};
const add = (items) => items.reduce((a, b) => a + b, 0n);
const address = (value) => {
  if (typeof value !== 'string' || !/^0x[0-9a-fA-F]{40}$/.test(value))
    throw new Error('Invalid recipient address');
  return value.toLowerCase();
};
export function normalizeOutcome(outcome) {
  if (!Array.isArray(outcome) || outcome.length === 0) throw new Error('Missing recipient outcomes');
  const seen = new Set();
  return outcome.map(({ recipient, asset, deltaWei }) => {
    const to = address(recipient);
    if (typeof asset !== 'string' || !/^(native|0x[0-9a-fA-F]{40})$/.test(asset))
      throw new Error('Invalid asset');
    const key = to + ':' + asset.toLowerCase();
    if (seen.has(key)) throw new Error('Duplicate recipient and asset');
    seen.add(key);
    return [key, wei(deltaWei, 'deltaWei').toString()];
  }).sort((a, b) => a[0].localeCompare(b[0]));
}
export function accountPath(path) {
  if (!path || !Array.isArray(path.receipts) || path.receipts.length === 0)
    throw new Error('Missing actual receipts');
  if (!Number.isSafeInteger(path.obligations) || path.obligations < 1)
    throw new Error('Invalid obligation count');
  const execution = add(path.receipts.map((r, i) => {
    if (r.status !== '0x1' || !/^0x[0-9a-fA-F]{64}$/.test(r.transactionHash || ''))
      throw new Error('Missing successful transaction receipt at ' + i);
    const gas = wei(r.gasUsed, 'gasUsed');
    const price = wei(r.effectiveGasPriceWei, 'effectiveGasPriceWei');
    return gas * price;
  }));
  // L2 data charges must be explicit even when zero; never silently default missing to zero.
  const data = add(path.receipts.map((r) => wei(r.dataFeeWei, 'dataFeeWei')));
  const categories = ['relayerFeeWei', 'authorizationFeeWei', 'deploymentFeeWei', 'settlementFeeWei', 'otherFeeWei'];
  const extras = Object.fromEntries(categories.map(k => [k, wei(path[k], k)]));
  const total = execution + data + add(Object.values(extras));
  return { obligations: path.obligations, outcome: normalizeOutcome(path.outcome),
    executionWei: execution.toString(), dataWei: data.toString(),
    ...Object.fromEntries(Object.entries(extras).map(([k, v]) => [k, v.toString()])),
    totalWei: total.toString(), perObligationFloorWei: (total / BigInt(path.obligations)).toString() };
}
export function compareEquivalent(baseline, candidate) {
  const a = accountPath(baseline), b = accountPath(candidate);
  if (a.obligations !== b.obligations || JSON.stringify(a.outcome) !== JSON.stringify(b.outcome))
    throw new Error('Non-equivalent recipient outcomes or obligation counts');
  const base = BigInt(a.totalWei), test = BigInt(b.totalWei);
  if (base === 0n) throw new Error('Zero-cost baseline');
  // Signed basis points: positive indicates savings; avoid floating-point rounding.
  const delta = base - test;
  const savingsBasisPoints = (delta * 10000n / base).toString();
  return { baseline: a, candidate: b, savingsBasisPoints,
    exceeds45Percent: delta * 100n > base * 45n,
    measuredScope: 'Provided receipt execution + explicitly reported fees only; no unreported network or operational costs' };
}
