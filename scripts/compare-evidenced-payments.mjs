#!/usr/bin/env node
// Read-only integration of recipient outcome reconciliation and all-in mined receipt arithmetic.
// Neither a single RPC nor a supplied capture establishes finality or independent verification.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {reconcileRecipientOutcomes} from './recipient-outcomes.mjs';
import {compareCapturedPayments} from './compare-captures.mjs';

export function compareEvidencedPayments({baselineCapture,candidateCapture,baselineCosts,candidateCosts,baselineSnapshot,candidateSnapshot,thresholdBps=4500}) {
  const outcome=reconcileRecipientOutcomes(baselineSnapshot,candidateSnapshot);
  assert(outcome.equivalent===true,'Recipient payouts not equivalent');
  assert(baselineCapture?.chainId===outcome.chainId && candidateCapture?.chainId===outcome.chainId,
    'Receipt capture chain differs from recipient snapshot chain');
  const comparison=compareCapturedPayments({baselineCapture,candidateCapture,baselineCosts,candidateCosts,
    baselineOutcomeDigest:outcome.outcomeDigest,candidateOutcomeDigest:outcome.outcomeDigest,thresholdBps});
  return {...comparison,asset:outcome.asset,recipientCount:outcome.recipientCount,
    outcomeDigest:outcome.outcomeDigest,recipientDeltaEquivalent:true,
    claimableSavings:false,verifiedByTool:false,
    missingEvidence:['Independent canonical/finalized block and receipt verification',
      'Independent recipient balance proof or cross-RPC verification',
      'Independent validation of complete relayer, deployment, data and settlement costs'],
    caveat:'Equivalent recipient deltas and all-in fee arithmetic are checked against supplied evidence; independent chain finality, balances and fee completeness are not proven.'};
}
if(process.argv[1]?.endsWith('/compare-evidenced-payments.mjs')) {
  try {
    assert(process.argv.length===3,'Usage: node scripts/compare-evidenced-payments.mjs <manifest.json>');
    const manifest=JSON.parse(await readFile(process.argv[2],'utf8'));
    const required=['baselineCapturePath','candidateCapturePath','baselineSnapshotPath','candidateSnapshotPath'];
    for(const field of required)assert(typeof manifest[field]==='string'&&manifest[field].length>0,'Missing '+field);
    const [baselineCapture,candidateCapture,baselineSnapshot,candidateSnapshot]=await Promise.all(required.map(async field=>JSON.parse(await readFile(manifest[field],'utf8'))));
    console.log(JSON.stringify(compareEvidencedPayments({...manifest,baselineCapture,candidateCapture,baselineSnapshot,candidateSnapshot}),null,2));
  } catch(error){console.error(error.message);process.exitCode=1;}
}
