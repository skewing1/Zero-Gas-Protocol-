#!/usr/bin/env node
// Independently derive equivalent recipient deltas from before/after balance snapshots.
// Snapshots must originate from trustworthy RPC/state proofs; this utility cannot attest them.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

const decimal = (value, label) => {
  assert(typeof value === 'string' && /^(0|[1-9][0-9]*)$/.test(value), label + ' must be unsigned decimal');
  return BigInt(value);
};
const address = (value, label) => {
  assert(typeof value === 'string' && /^0x[0-9a-fA-F]{40}$/.test(value), label + ' must be EVM address');
  return value.toLowerCase();
};
function normalize(snapshot, label) {
  assert(snapshot && typeof snapshot === 'object', label + ' snapshot missing');
  const chainId = decimal(snapshot.chainId, label + ' chainId');
  assert(chainId > 0n, label + ' chainId must be positive');
  const asset = snapshot.asset === 'native' ? 'native' : address(snapshot.asset, label + ' asset');
  assert(Array.isArray(snapshot.recipients) && snapshot.recipients.length > 0, label + ' recipients missing');
  const seen = new Set();
  const deltas = snapshot.recipients.map((entry) => {
    const recipient = address(entry.address, label + ' recipient');
    assert(!seen.has(recipient), label + ' duplicate recipient');
    seen.add(recipient);
    const before = decimal(entry.before, label + ' before');
    const after = decimal(entry.after, label + ' after');
    assert(after >= before, label + ' recipient balance decreased');
    return [recipient, (after - before).toString()];
  }).sort((a,b) => a[0].localeCompare(b[0]));
  return {chainId:chainId.toString(), asset, deltas};
}
export function reconcileRecipientOutcomes(baseline, candidate) {
  const b = normalize(baseline, 'baseline');
  const c = normalize(candidate, 'candidate');
  assert(b.chainId === c.chainId && b.asset === c.asset, 'Different chain or asset');
  assert(JSON.stringify(b.deltas) === JSON.stringify(c.deltas), 'Different recipient balance deltas');
  const payload = JSON.stringify({version:1, chainId:b.chainId, asset:b.asset, recipients:b.deltas});
  return {
    chainId:b.chainId, asset:b.asset, recipientCount:b.deltas.length,
    outcomeDigest:'0x'+createHash('sha256').update(payload).digest('hex'),
    equivalent:true, verifiedByTool:false,
    caveat:'Only arithmetic equivalence of supplied snapshots. Validate block heights, finality, RPC independence, and token balance provenance separately.'
  };
}
