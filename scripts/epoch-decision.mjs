import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
const results = JSON.parse(readFileSync('bench/epoch-results.json'));
const expected = ['fresh-unique','fresh-distinct-payers','one-payer-1000','one-payer-10000',
  'hundred-payers-10000','one-payer-10000-irregular','unique-payers-unique-payees-1000'];
const rows = [];
assert.equal(results.length, expected.length * 2, 'Require exactly all workload/asset controls');
for (const name of expected) for (const asset of ['native','token']) {
  const matches = results.filter(row => row.scenario.name === name && row.asset === asset);
  assert.equal(matches.length, 1, `Missing or duplicate measured control: ${name}/${asset}`);
  const row = matches[0];
  assert(row.baselineNet && row.receipts.directNet?.length, `Missing P0-net receipts: ${name}/${asset}`);
  for (const [path, summary] of [['direct', row.baseline], ['directNet', row.baselineNet], ['epoch', row.cold], ['setup', row.sharedSetup]]) {
    assert.equal(summary.gas, row.receipts[path].reduce((total, receipt) => total + receipt.gas, 0), `${path} gas reconciliation`);
    assert.equal(BigInt(summary.feeWei), row.receipts[path].reduce((total, receipt) => total + BigInt(receipt.feeWei), 0n), `${path} fee reconciliation`);
  }
  assert.deepEqual(row.balanceEquivalence.p0, row.balanceEquivalence.p0Net, 'P0-net recipient equivalence');
  assert.deepEqual(row.balanceEquivalence.p0, row.balanceEquivalence.epoch, 'Epoch recipient equivalence');
  const p0 = BigInt(row.baseline.gas) + BigInt(row.sharedSetup.gas);
  const net = BigInt(row.baselineNet.gas) + BigInt(row.sharedSetup.gas);
  const protocol = BigInt(row.cold.gas) + BigInt(row.sharedSetup.gas);
  assert(p0 > 0n && net > 0n && protocol > 0n);
  const p0Fees = BigInt(row.baseline.feeWei) + BigInt(row.sharedSetup.feeWei);
  const netFees = BigInt(row.baselineNet.feeWei) + BigInt(row.sharedSetup.feeWei);
  const protocolFees = BigInt(row.cold.feeWei) + BigInt(row.sharedSetup.feeWei);
  rows.push({ name, asset, p0Gas:row.baseline.gas, netGas:row.baselineNet.gas, coldGas:row.cold.gas,
    p0Saving:100*(1-Number(protocol)/Number(p0)), netSaving:100*(1-Number(protocol)/Number(net)),
    p0FeeSaving:100*(1-Number(protocolFees)/Number(p0Fees)), netFeeSaving:100*(1-Number(protocolFees)/Number(netFees)),
    pass90:protocol*10n <= net, pass99:protocol*100n <= net });
}
const universal = rows.every(row => row.pass90);
const report = [
  '# Compact-epoch target decision: P0-net controls the gate', '',
  `90% across all measured controls versus P0-net: **${universal ? 'PASS' : 'FAIL'}**.`,
  'Full-platform 90–99% target: **NOT ESTABLISHED**. This experiment measures payments only.',
  'P0 = per-payment transactions. Saving vs P0 includes the effect of choosing to settle in aggregate.',
  'P0-net = same settlement window, no protocol: plain transfers of each payer/payee total. Both the 90% and 99% gates use P0-net.',
  'All-in savings include protocol deployment and delegation; identical token setup is counted on both sides. Raw gas columns exclude this shared token setup.',
  'All paths assert equal final recipient balances and gas-adjusted payer principal. Negative saving means increased cost.', '',
  '| Workload | Asset | P0 gas | P0-net gas | Epoch cold gas | Saving vs P0, all-in* | Saving vs P0-net, all-in | 90% vs P0-net | 99% vs P0-net |',
  '| --- | --- | ---: | ---: | ---: | ---: | ---: | --- | --- |',
  ...rows.map(r=>`| ${r.name} | ${r.asset} | ${r.p0Gas} | ${r.netGas} | ${r.coldGas} | ${r.p0Saving.toFixed(2)}% | ${r.netSaving.toFixed(2)}% | ${r.pass90?'PASS':'FAIL'} | ${r.pass99?'PASS':'FAIL'} |`), '',
  '*Includes the effect of choosing to settle in aggregate. This reference column is not a measure of protocol-specific savings.', '',
  '## Actual local fee savings, all-in', '',
  '| Workload | Asset | Saving vs P0* | Saving vs P0-net |',
  '| --- | --- | ---: | ---: |',
  ...rows.map(r=>`| ${r.name} | ${r.asset} | ${r.p0FeeSaving.toFixed(2)}% | ${r.netFeeSaving.toFixed(2)}% |`), '',
  'Local fee prices are not mainnet projections. Proof anchoring, service verification and off-chain operating costs remain unmeasured.', '',
].join('\n');
writeFileSync('bench/epoch-decision.md', report);
console.log(report);
