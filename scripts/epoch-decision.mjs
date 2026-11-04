import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
const results = JSON.parse(readFileSync('bench/epoch-results.json'));
const expected = ['fresh-unique','fresh-distinct-payers','one-payer-1000','one-payer-10000','hundred-payers-10000','one-payer-10000-irregular'];
const rows = [];
for (const name of expected) for (const asset of ['native','token']) {
  const row = results.find(row => row.scenario.name === name && row.asset === asset);
  assert(row, `Missing measured control: ${name}/${asset}`);
  const baseline = BigInt(row.baseline.gas + row.sharedSetup.gas);
  const protocol = BigInt(row.cold.gas + row.sharedSetup.gas);
  const baselineFees = BigInt(row.baseline.feeWei) + BigInt(row.sharedSetup.feeWei);
  const protocolFees = BigInt(row.cold.feeWei) + BigInt(row.sharedSetup.feeWei);
  rows.push({ name, asset, gasSaving:100*(1-Number(protocol)/Number(baseline)),
    feeSaving:100*(1-Number(protocolFees)/Number(baselineFees)),
    pass90:protocol*10n <= baseline, pass99:protocol*100n <= baseline });
}
const universal = rows.every(row => row.pass90);
writeFileSync('bench/epoch-decision.md', [
  '# Compact-epoch target decision', '',
  `90% across all measured controls: **${universal ? 'PASS' : 'FAIL'}**.`,
  'Full-platform 90–99% target: **NOT ESTABLISHED**. This experiment measures payments only.',
  'Gas savings include protocol deployment, delegation and shared token setup. Actual local fee savings include all receipt fees; local fee prices are not mainnet projections.',
  'All rows compare final wallet balances. Windowed settlement changes intermediate spendability and event granularity.', '',
  '| Workload | Asset | All-in gas saving | Actual local fee saving | 90% gas | 99% gas |',
  '| --- | --- | ---: | ---: | --- | --- |',
  ...rows.map(r=>`| ${r.name} | ${r.asset} | ${r.gasSaving.toFixed(2)}% | ${r.feeSaving.toFixed(2)}% | ${r.pass90?'PASS':'FAIL'} | ${r.pass99?'PASS':'FAIL'} |`), '',
  'The fresh-recipient and independent-payer controls prevent a concentrated-payment result from being labeled a universal gain.',
  'Proof anchoring, service-manifest verification, real-network prices, off-chain operations and settlement-window latency remain outside this experiment. Include them before deciding platform viability.', '',
].join('\n'));
console.log(`All measured controls at 90%: ${universal ? 'PASS' : 'FAIL'}. Full-platform target not established.`);
