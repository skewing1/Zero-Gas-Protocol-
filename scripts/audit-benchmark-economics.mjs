import assert from 'node:assert/strict';

const wei = value => {
  assert(typeof value === 'string' && /^(0|[1-9][0-9]*)$/.test(value), 'Expected canonical wei string');
  return BigInt(value);
};
const bps = value => {
  assert(typeof value === 'string' && /^-?(0|[1-9][0-9]*)$/.test(value), 'Expected integer basis points');
  return BigInt(value);
};

// Independent second pass: never trust derived savings fields from a JSON artifact.
// This audits only measured on-chain lifecycle fees. Relayer compensation, cross-chain
// settlement and off-chain costs require separately sourced evidence before any all-in claim.
export function auditEconomics(groups) {
  assert(Array.isArray(groups) && groups.length === 8, 'Expected eight benchmark cohorts');
  const output = [];
  for (const group of groups) {
    const baseline = group.paths?.find(p => p.path === 'P0');
    assert(baseline, 'Missing conventional baseline');
    const baselineFee = wei(baseline.lifecycleFeeWei);
    assert(baselineFee > 0n, 'Zero conventional baseline');
    for (const path of group.paths) {
      const receipts = path.receipts;
      assert(Array.isArray(receipts) && receipts.length > 0, 'Missing receipts');
      const execution = receipts.filter(r => r.stage !== 'deployment' && r.stage !== 'prefund');
      const sum = (rows, key) => rows.reduce((acc, r) => acc + BigInt(r[key]), 0n);
      assert.equal(wei(path.feeWei), sum(execution, 'feeWei'), 'Execution fee mismatch');
      assert.equal(wei(path.lifecycleFeeWei), sum(receipts, 'feeWei'), 'Lifecycle fee mismatch');
      assert(Number.isSafeInteger(path.gas) && path.gas >= 0, 'Invalid reported gas');
      assert.equal(BigInt(path.gas), sum(execution, 'gasUsed'), 'Reported gas mismatch');
      assert(Number.isSafeInteger(path.txCount) && path.txCount >= 0, 'Invalid transaction count');
      assert.equal(path.txCount, execution.length, 'Transaction count mismatch');
      assert(Number.isSafeInteger(path.calldataBytes) && path.calldataBytes >= 0, 'Invalid calldata total');
      assert(execution.every(r => Number.isSafeInteger(r.calldataBytes) && r.calldataBytes >= 0), 'Missing receipt calldata');
      assert.equal(BigInt(path.calldataBytes), sum(execution, 'calldataBytes'), 'Calldata total mismatch');
      const fee = wei(path.lifecycleFeeWei);
      const savings = (baselineFee - fee) * 10000n / baselineFee;
      assert.equal(bps(path.lifecycleSavingsBps), savings, 'Savings basis points mismatch');
      output.push({ cohort: group.workload + '/' + group.asset, path: path.path,
        lifecycleFeeWei: fee.toString(), baselineFeeWei: baselineFee.toString(),
        measuredOnchainSavingsBps: savings.toString(),
        allInSavingsVerified: false,
        excludedCosts: ['relayer compensation', 'off-chain operation', 'cross-chain settlement'] });
    }
  }
  return output;
}
