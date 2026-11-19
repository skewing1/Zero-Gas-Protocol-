#!/usr/bin/env node
// Calculate the maximum *additional* relayer charge compatible with a strict savings target.
// This is a sensitivity analysis, not a measured gas-savings claim.
import assert from 'node:assert/strict';
import { compareAllIn } from './compare-all-in.mjs';

export function relayerBudget(evidence, thresholdBps = 4500) {
  const result = compareAllIn({ ...evidence, thresholdBps });
  const baseline = BigInt(result.baselineWei);
  const candidate = BigInt(result.candidateWei);
  const t = BigInt(thresholdBps);
  // Require (baseline - candidate - extra) * 10000 > t * baseline.
  // Integer arithmetic avoids floating-point rounding and off-by-one approvals.
  const numerator = (10000n - t) * baseline - 1n;
  const maxCandidate = numerator >= 0n ? numerator / 10000n : -1n;
  const remaining = maxCandidate - candidate;
  return {
    ...result,
    maxAdditionalRelayerWei: remaining >= 0n ? remaining.toString() : '0',
    targetAlreadyMissed: remaining < 0n,
    strictTarget: true,
    verifiedByTool: false,
    caveat: 'Sensitivity calculation only; input receipt and fee evidence and payment outcomes are not independently verified.'
  };
}
if (process.argv[1]?.endsWith('/relayer-budget.mjs')) {
  const fs = await import('node:fs/promises');
  assert(process.argv.length === 3, 'Usage: node scripts/relayer-budget.mjs <evidence.json>');
  console.log(JSON.stringify(relayerBudget(JSON.parse(await fs.readFile(process.argv[2], 'utf8'))), null, 2));
}
