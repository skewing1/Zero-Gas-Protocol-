// Exact-integer comparison of economically complete receipt costs.
export function compareAllIn(paths) {
  if (!Array.isArray(paths) || paths.length < 2 || paths[0]?.path !== 'P0') throw new Error('P0 baseline required');
  const parse = (value, label) => {
    if (typeof value !== 'string' || !/^(0|[1-9][0-9]*)$/.test(value)) throw new Error(`Invalid ${label}`);
    return BigInt(value);
  };
  const cost = path => {
    const settlement = parse(path.feeWei, 'settlement fee');
    const prefund = parse(path.prefunding?.feeWei, 'prefunding fee');
    const deployment = parse(path.deployment?.feeWei, 'deployment fee');
    const total = settlement + prefund + deployment;
    if (total !== parse(path.allInFeeWei, 'all-in fee')) throw new Error('All-in fee does not reconcile');
    if (!Array.isArray(path.finalBalances) || !path.finalBalances.length) throw new Error('Missing final balances');
    return total;
  };
  const baseline = paths[0];
  const baselineCost = cost(baseline);
  if (baselineCost === 0n) throw new Error('Zero baseline cost');
  const seen = new Set();
  return paths.map(path => {
    if (!path.path || seen.has(path.path)) throw new Error('Duplicate or missing path');
    seen.add(path.path);
    const candidateCost = cost(path);
    if (JSON.stringify(path.finalBalances) !== JSON.stringify(baseline.finalBalances)) throw new Error('Different recipient balances');
    // Savings in basis points, rounded toward zero; negative savings retained.
    const savingsBps = (baselineCost - candidateCost) * 10000n / baselineCost;
    return { path: path.path, allInReceiptFeeWei: candidateCost.toString(), savingsBps: savingsBps.toString(), exceeds45Percent: savingsBps > 4500n };
  });
}
