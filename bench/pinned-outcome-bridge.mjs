// Read-only bridge from pinned RPC observations to the offline outcome consistency gate.
// Does not prove canonical finality, transaction causality, or RPC honesty.
import { collectPinnedSnapshot } from './pinned-rpc-snapshot.mjs';
import { verifySnapshotOutcomes } from './outcome-snapshot-gate.mjs';

export async function verifyPinnedPaymentOutcomes(rpc, path, beforeBlock, afterBlock) {
  if (!path || !Array.isArray(path.outcome) || !path.outcome.length)
    throw Error('Missing declared payment outcomes');
  if (!beforeBlock || !afterBlock) throw Error('Missing block identities');
  // Read both sides using exactly the declared coverage; the gate rejects duplicates,
  // missing values, zero payments, chain mismatches, and nonmatching deltas.
  const entries = path.outcome.map(({ recipient, asset }) => ({ recipient, asset }));
  const before = await collectPinnedSnapshot(rpc, {
    chainId: path.chainId, blockNumber: beforeBlock.number,
    blockHash: beforeBlock.hash, entries
  });
  const after = await collectPinnedSnapshot(rpc, {
    chainId: path.chainId, blockNumber: afterBlock.number,
    blockHash: afterBlock.hash, entries
  });
  const result = verifySnapshotOutcomes(path, before, after);
  return {
    ...result,
    before, after,
    evidenceType: 'EIP-1898 pinned RPC observations; not cryptographic state proof',
    finalityVerified: false,
    transactionCausalityVerified: false
  };
}
