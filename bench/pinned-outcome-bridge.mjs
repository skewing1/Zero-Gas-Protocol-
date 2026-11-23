// Read-only bridge from pinned RPC observations to the offline outcome consistency gate.
// Does not prove canonical finality, transaction causality, or RPC honesty.
import { collectPinnedSnapshot } from './pinned-rpc-snapshot.mjs';
import { verifySnapshotOutcomes } from './outcome-snapshot-gate.mjs';

function quantity(value) {
  if (typeof value !== 'string' || !/^0x(?:0|[1-9a-fA-F][0-9a-fA-F]*)$/.test(value))
    throw Error('Invalid RPC quantity during cross-snapshot recheck');
  return BigInt(value);
}
async function recheckBlock(rpc, snapshot) {
  const block = await rpc('eth_getBlockByNumber', ['0x' + BigInt(snapshot.blockNumber).toString(16), false]);
  if (!block || typeof block.hash !== 'string' ||
      block.hash.toLowerCase() !== snapshot.blockHash ||
      quantity(block.number) !== BigInt(snapshot.blockNumber))
    throw Error('Block identity changed across snapshot collection');
}

export async function verifyPinnedPaymentOutcomes(rpc, path, beforeBlock, afterBlock) {
  if (!path || !Array.isArray(path.outcome) || !path.outcome.length)
    throw Error('Missing declared payment outcomes');
  if (!beforeBlock || !afterBlock) throw Error('Missing block identities');
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
  // A block can reorganize after its own collector's final check while the other
  // snapshot is being fetched. Recheck BOTH identities at the end, including chain.
  if (quantity(await rpc('eth_chainId', [])) !== BigInt(before.chainId))
    throw Error('RPC chain changed across snapshot collection');
  await recheckBlock(rpc, before);
  await recheckBlock(rpc, after);
  return {
    ...result,
    before, after,
    evidenceType: 'EIP-1898 pinned RPC observations; not cryptographic state proof',
    finalityVerified: false,
    transactionCausalityVerified: false
  };
}
