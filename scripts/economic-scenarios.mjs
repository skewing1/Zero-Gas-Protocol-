// Scenario analysis only: user-supplied off-chain costs are assumptions, not receipt evidence.
const wei = (value, name) => {
  if (typeof value !== 'string' || !/^(0|[1-9][0-9]*)$/.test(value))
    throw new TypeError(`${name} must be a nonnegative decimal wei string`);
  return BigInt(value);
};
const fields = ['relayerWei', 'dataWei', 'proofWei', 'bridgeWei', 'infrastructureWei'];
export function compareEconomicScenarios(receiptRows, assumptions) {
  if (!Array.isArray(receiptRows) || receiptRows.length < 2 || receiptRows[0]?.path !== 'P0')
    throw new Error('P0 baseline and at least one candidate required');
  if (!assumptions || typeof assumptions !== 'object' || Array.isArray(assumptions))
    throw new Error('Explicit cost assumptions required for every path');
  const names = receiptRows.map(row => row.path);
  if (names.some(name => typeof name !== 'string' || !name) || new Set(names).size !== names.length)
    throw new Error('Unique path names required');
  if (Object.keys(assumptions).some(name => !names.includes(name))) throw new Error('Unknown assumption path');
  const results = receiptRows.map(row => {
    const costs = assumptions[row.path];
    if (!costs || typeof costs !== 'object' || Array.isArray(costs) ||
        Object.keys(costs).some(field => !fields.includes(field)))
      throw new Error(`Invalid cost assumptions for ${row.path}`);
    const components = Object.fromEntries(fields.map(field => [field, wei(costs[field], `${row.path}.${field}`)]));
    const receiptWei = wei(row.allInReceiptFeeWei, `${row.path}.allInReceiptFeeWei`);
    const overheadWei = Object.values(components).reduce((sum, cost) => sum + cost, 0n);
    return { path: row.path, receiptWei, overheadWei, totalWei: receiptWei + overheadWei };
  });
  const baseline = results[0].totalWei;
  if (baseline === 0n) throw new Error('Zero baseline cost');
  return results.map(row => {
    const savingsBps = (baseline - row.totalWei) * 10000n / baseline;
    return { path: row.path, receiptWei: row.receiptWei.toString(),
      assumedOverheadWei: row.overheadWei.toString(), totalWei: row.totalWei.toString(),
      savingsBps: savingsBps.toString(), exceeds45PercentScenario: savingsBps > 4500n,
      evidence: 'scenario-only; off-chain costs supplied, not independently verified' };
  });
}
