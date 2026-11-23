// Composes independent pinned balance observations with receipt-based accounting.
// This is an RPC consistency gate, NOT cryptographic proof, finality, or causality.
import { verifyPinnedPaymentOutcomes } from './pinned-outcome-bridge.mjs';
import { compareReceiptEvidence } from './receipt-evidence-adapter.mjs';

const hash = x => typeof x === 'string' && /^0x[0-9a-fA-F]{64}$/.test(x);
const decimal = x => typeof x === 'string' && /^(0|[1-9][0-9]*)$/.test(x);

export async function comparePinnedReceiptPaths({ rpc, baseline, candidate }) {
  if (typeof rpc !== 'function') throw Error('Missing RPC reader');
  for (const [name, item] of [['baseline', baseline], ['candidate', candidate]]) {
    if (!item || !item.path || !item.beforeBlock || !item.afterBlock)
      throw Error('Missing ' + name + ' evidence');
    for (const b of [item.beforeBlock, item.afterBlock]) {
      if (!hash(b.hash) || !decimal(b.number)) throw Error('Invalid ' + name + ' block identity');
    }
    if (BigInt(item.afterBlock.number) <= BigInt(item.beforeBlock.number))
      throw Error('Invalid ' + name + ' block order');
  }
  // Separate experiments cannot be certified using identical observation windows.
  if (baseline.beforeBlock.hash.toLowerCase() === candidate.beforeBlock.hash.toLowerCase() &&
      baseline.afterBlock.hash.toLowerCase() === candidate.afterBlock.hash.toLowerCase())
    throw Error('Baseline and candidate reuse an observation window');
  const a = await verifyPinnedPaymentOutcomes(rpc, baseline.path, baseline.beforeBlock, baseline.afterBlock);
  const b = await verifyPinnedPaymentOutcomes(rpc, candidate.path, candidate.beforeBlock, candidate.afterBlock);
  const result = compareReceiptEvidence(baseline.path, candidate.path);
  if (a.chainId !== result.baseline.chainId || b.chainId !== result.candidate.chainId)
    throw Error('Balance evidence chain does not match receipt cost evidence');
  return {
    ...result,
    baselineBalanceEvidence: { beforeBlockHash: a.beforeBlockHash, afterBlockHash: a.afterBlockHash, checkedRecipients: a.checkedRecipients },
    candidateBalanceEvidence: { beforeBlockHash: b.beforeBlockHash, afterBlockHash: b.afterBlockHash, checkedRecipients: b.checkedRecipients },
    evidenceStatus: 'RPC-observed balance arithmetic and supplied receipt accounting only',
    independentFinalityVerified: false,
    transactionCausalityVerified: false,
    allInSavingsVerified: false
  };
}
