import assert from 'node:assert/strict';
const wei = value => {
  assert(typeof value === 'string' && /^(0|[1-9][0-9]*)$/.test(value), 'Expected canonical nonnegative decimal wei string');
  return BigInt(value);
};
const quantity = value => {
  assert(typeof value === 'string' && /^0x(?:0|[1-9a-fA-F][0-9a-fA-F]*)$/.test(value), 'Expected canonical hex quantity');
  return BigInt(value);
};
export function validateBench(groups) {
  assert(Array.isArray(groups) && groups.length === 8, 'Expected eight cohorts');
  const cohorts = new Set();
  for (const group of groups) {
    assert(['W1','W2','W3','W4'].includes(group.workload), 'Invalid workload');
    assert(['native','token'].includes(group.asset), 'Invalid asset');
    const cohort = group.workload + '/' + group.asset;
    assert(!cohorts.has(cohort), 'Duplicate benchmark cohort');
    cohorts.add(cohort);
    const expected = group.asset === 'native' ? ['P0','P1','P1-net','P2'] : ['P0','P1','P1-net'];
    assert.deepEqual(group.paths?.map(p => p.path), expected, 'Missing, reordered, or repeated benchmark path');
    const baseline = group.paths[0].finalBalances;
    assert(Array.isArray(baseline) && baseline.length > 0, 'Missing baseline balances');
    for (const path of group.paths) {
      assert.deepEqual(path.finalBalances, baseline, 'Recipient outcomes differ from baseline');
      assert(path.finalBalances.every(x => typeof x === 'string' && /^(0|[1-9][0-9]*)$/.test(x)), 'Malformed recipient balance');
      assert(Array.isArray(path.receipts) && path.receipts.length > 0, 'Missing receipts');
      const hashes = new Set();
      const fees = { deployment: 0n, prefund: 0n, execution: 0n };
      for (const receipt of path.receipts) {
        assert(/^0x[0-9a-fA-F]{64}$/.test(receipt.hash), 'Invalid transaction hash');
        const hash = receipt.hash.toLowerCase();
        assert(!hashes.has(hash), 'Duplicate receipt within path');
        hashes.add(hash);
        assert(['deployment', 'prefund', 'settlement', 'approval'].includes(receipt.stage), 'Unknown receipt stage');
        assert(Number.isSafeInteger(receipt.gasUsed) && receipt.gasUsed >= 0, 'Invalid receipt gas used');
        const gasPrice = wei(receipt.effectiveGasPrice);
        const l1 = receipt.l1Fee == null ? 0n : wei(receipt.l1Fee);
        const blobGas = receipt.blobGasUsed == null ? 0n : quantity(receipt.blobGasUsed);
        const blobPrice = receipt.blobGasPrice == null ? 0n : quantity(receipt.blobGasPrice);
        assert(blobGas === 0n || receipt.blobGasPrice != null, 'Missing blob price');
        const blobFee = blobGas * blobPrice;
        if (receipt.blobFeeWei != null) assert.equal(wei(receipt.blobFeeWei), blobFee, 'Blob fee mismatch');
        const fee = BigInt(receipt.gasUsed) * gasPrice + l1 + blobFee;
        assert.equal(wei(receipt.feeWei), fee, 'Receipt fee does not reconcile to gas and data charges');
        const category = receipt.stage === 'deployment' ? 'deployment' : receipt.stage === 'prefund' ? 'prefund' : 'execution';
        fees[category] += fee;
      }
      assert.equal(wei(path.feeWei), fees.execution, 'Execution fee does not reconcile to receipts');
      assert.equal(wei(path.deployment?.feeWei), fees.deployment, 'Deployment fee does not reconcile to receipts');
      assert.equal(wei(path.prefunding?.feeWei), fees.prefund, 'Prefunding fee does not reconcile to receipts');
      assert.equal(wei(path.lifecycleFeeWei), fees.execution + fees.deployment + fees.prefund, 'Lifecycle fee mismatch');
    }
  }
  return true;
}
