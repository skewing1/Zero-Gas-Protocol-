import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const [first, second] = process.argv.slice(2);
if (!first || !second) throw new Error('Pass first and second result JSON files');
const metrics = file => JSON.parse(readFileSync(file)).map(row => ({
  workload:row.scenario.name, asset:row.asset,
  receipts:Object.fromEntries(Object.entries(row.receipts).map(([path, receipts]) => [path, receipts.map(tx=>tx.gas)])),
}));
assert.deepEqual(metrics(first), metrics(second));
console.log('Every receipt gas value matches across both runs.');
