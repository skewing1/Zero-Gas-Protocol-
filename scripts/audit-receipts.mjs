// Audit benchmark receipt rows before claiming savings. No RPC or paid services.
import { readFileSync } from 'node:fs';
import { allInCost, compareCosts } from './fee-accounting.mjs';

const uint = (x, label) => {
  if (typeof x !== 'string' || !/^(0|[1-9][0-9]*)$/.test(x)) throw new TypeError(label + ' must be decimal wei');
  return BigInt(x);
};
export function auditGroups(groups, { baseline = 'P0', candidate = 'P1-net', overhead = {} } = {}) {
  if (!Array.isArray(groups) || !groups.length) throw new Error('Nonempty benchmark groups required');
  const results = [];
  for (const group of groups) {
    if (!Array.isArray(group.paths)) throw new Error('Missing paths');
    const byPath = new Map(group.paths.map(p => [p.path, p]));
    if (byPath.size !== group.paths.length) throw new Error('Duplicate path');
    const pair = [byPath.get(baseline), byPath.get(candidate)];
    if (pair.some(p => !p)) throw new Error('Missing comparison path: ' + group.workload + '/' + group.asset);
    const audited = pair.map(p => {
      if (!Array.isArray(p.receipts)) throw new Error('Missing receipts');
      const counted = p.receipts.filter(r => r.stage !== 'prefund');
      if (counted.some(r => !['deployment', 'approval', 'settlement'].includes(r.stage)))
        throw new Error('Unknown receipt stage');
      if (new Set(counted.map(r => r.hash)).size !== counted.length) throw new Error('Duplicate transaction hash');
      const settlement = counted.filter(r => r.stage !== 'deployment');
      const deployment = counted.filter(r => r.stage === 'deployment');
      const toReceipt = r => ({ status: '0x1', gasUsed: String(r.gasUsed), effectiveGasPrice: r.effectiveGasPrice,
        ...(r.l1Fee === undefined ? {} : { l1Fee: r.l1Fee }) });
      for (const r of counted) {
        const expected = allInCost({ receipts: [toReceipt(r)] }).totalWei;
        if (uint(r.feeWei, 'receipt.feeWei') !== BigInt(expected)) throw new Error('Receipt fee mismatch: ' + r.hash);
      }
      const actual = allInCost({ receipts: settlement.map(toReceipt),
        ...(overhead[p.path] ?? {}),
        amortizedDeploymentWei: allInCost({ receipts: deployment.map(toReceipt) }).totalWei });
      if (uint(p.feeWei, 'path.feeWei') !== BigInt(allInCost({ receipts: settlement.map(toReceipt) }).totalWei))
        throw new Error('Path fee mismatch: ' + p.path);
      if (uint(p.deployment.feeWei, 'deployment.feeWei') !== BigInt(allInCost({ receipts: deployment.map(toReceipt) }).totalWei))
        throw new Error('Deployment fee mismatch: ' + p.path);
      if (p.txCount !== settlement.length) throw new Error('Transaction count mismatch: ' + p.path);
      return actual;
    });
    if (JSON.stringify(pair[0].finalBalances) !== JSON.stringify(pair[1].finalBalances))
      throw new Error('Different final recipient balances');
    results.push({ workload: group.workload, asset: group.asset, baseline, candidate,
      baselineWei: audited[0].totalWei, candidateWei: audited[1].totalWei,
      ...compareCosts(audited[0], audited[1]) });
  }
  return results;
}
if (process.argv[1] && import.meta.url === new URL('file://' + process.argv[1]).href) {
  const [file, baseline = 'P0', candidate = 'P1-net'] = process.argv.slice(2);
  if (!file) throw new Error('Usage: node scripts/audit-receipts.mjs bench/results.json [baseline] [candidate]');
  const results = auditGroups(JSON.parse(readFileSync(file, 'utf8')), { baseline, candidate });
  console.log(JSON.stringify(results, null, 2));
  if (results.some(row => !row.meets45Percent)) process.exitCode = 2;
}
