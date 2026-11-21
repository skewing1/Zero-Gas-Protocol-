#!/usr/bin/env node
// Offline only: accepts supplied evidence, never authenticates it.
import {readFileSync} from 'node:fs';
import {compareEvidence} from './all-in-evidence.mjs';
const MAX_BYTES = 2_000_000;
function main(args) {
  if (args.length !== 1 || (args[0].startsWith('-') && args[0] !== '-')) throw Error('usage: node bench/all-in-cli.mjs <evidence.json> (or - for stdin)');
  const path = args[0];
  const raw = readFileSync(path === '-' ? 0 : path);
  if (raw.length > MAX_BYTES) throw Error('evidence exceeds 2 MB');
  const result = compareEvidence(JSON.parse(raw.toString('utf8')));
  process.stdout.write(JSON.stringify({kind:'UNVERIFIED_SUPPLIED_EVIDENCE_COMPARISON',...result},null,2)+'\n');
}
try {main(process.argv.slice(2));}
catch (err) {process.stderr.write('Evidence rejected: '+err.message+'\n');process.exitCode=1;}
