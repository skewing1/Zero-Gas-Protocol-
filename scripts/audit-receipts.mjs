// Audit benchmark receipt rows before claiming savings. No RPC or paid services.
import { readFileSync } from 'node:fs';
import { allInCost, compareCosts } from './fee-accounting.mjs';

const uint = (x, label) => {
  if (typeof x !== 'string' || !/^(0|[1-9][0-9]*)$/.test(x)) throw new TypeError(label + ' must be decimal wei');
  return BigInt(x);
};
export function auditGroups(groups, { baseline = 'P0', candidate = 'P1-net', overhead = {}, requireSuccessfulStatus = false } = {}) {
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
      // Reject missing identifiers and unsuccessful receipts before any accounting.
      // A benchmark must never turn a reverted transaction into a successful one.
      for (const r of p.receipts) {
        if (!r || typeof r.hash !== 'string' || !r.hash.trim())
          throw new Error('Missing transaction hash');
        if (requireSuccessfulStatus && r.status === undefined)
          throw new Error('Missing mined receipt status: ' + r.hash);
        if (r.status !== undefined && !['0x1', '1'].includes(r.status))
          throw new Error('Unsuccessful benchmark receipt: ' + r.hash);
      }
      if (new Set(p.receipts.map(r => r.hash)).size !== p.receipts.length)
        throw new Error('Duplicate transaction hash including prefund');
      if (p.receipts.some(r => !['prefund', 'deployment', 'approval', 'settlement'].includes(r.stage)))
        throw new Error('Unknown receipt stage');
      const counted = p.receipts.filter(r => r.stage !== 'prefund');
      if (counted.some(r => !['deployment', 'approval', 'settlement'].includes(r.stage)))
        throw new Error('Unknown receipt stage');
      if (new Set(counted.map(r => r.hash)).size !== counted.length) throw new Error('Duplicate transaction hash');
      const settlement = counted.filter(r => r.stage !== 'deployment');
      // Prefunding is a real paid transaction, even if excluded from path.feeWei.
      // Count it in all-in economics while retaining the original recorded path totals.
      const prefunding = p.receipts.filter(r => r.stage === 'prefund');
      const deployment = counted.filter(r => r.stage === 'deployment');
      const toReceipt = r => ({ status: r.status ?? '0x1', gasUsed: String(r.gasUsed), effectiveGasPrice: r.effectiveGasPrice,
        ...(r.l1Fee === undefined ? {} : { l1Fee: r.l1Fee }),
        ...(r.blobFee === undefined ? {} : { blobFee: r.blobFee }) });
      for (const r of p.receipts) {
        const expected = allInCost({ receipts: [toReceipt(r)] }).totalWei;
        if (uint(r.feeWei, 'receipt.feeWei') !== BigInt(expected)) throw new Error('Receipt fee mismatch: ' + r.hash);
      }
      // Only accept documented cost supplements. Never let caller-controlled
      // overhead replace the measured receipt array or deployment total.
      const extras = overhead[p.path] ?? {};
      const allowed = new Set(['relayerWei', 'proofWei', 'infrastructureWei', 'bridgingWei', 'amortizedDeploymentWei']);
      if (!extras || typeof extras !== 'object' || Array.isArray(extras) ||
          Object.keys(extras).some(key => !allowed.has(key)))
        throw new Error('Unknown overhead field: ' + p.path);
      const { relayerWei, proofWei, infrastructureWei, bridgingWei } = extras;
      const actual = allInCost({ receipts: [...prefunding, ...settlement].map(toReceipt),
        ...(relayerWei === undefined ? {} : { relayerWei }),
        ...(proofWei === undefined ? {} : { proofWei }),
        ...(infrastructureWei === undefined ? {} : { infrastructureWei }),
        ...(bridgingWei === undefined ? {} : { bridgingWei }),
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
  // CLI reports are authoritative: missing mined-success evidence is a hard failure.
  const results = auditGroups(JSON.parse(readFileSync(file, 'utf8')), { baseline, candidate, requireSuccessfulStatus: true });
  console.log(JSON.stringify(results, null, 2));
  if (results.some(row => !row.meets45Percent)) process.exitCode = 2;
}
