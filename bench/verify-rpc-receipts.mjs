// Read-only RPC evidence verification. No transaction signing, broadcasting, or paid endpoints.
const hex = (v, field) => {
  if (typeof v !== 'string' || !/^0x(?:0|[1-9a-fA-F][0-9a-fA-F]*)$/.test(v))
    throw new Error('Invalid RPC quantity: ' + field);
  return BigInt(v);
};
const hash = (v) => typeof v === 'string' && /^0x[0-9a-fA-F]{64}$/.test(v);
const same = (a,b) => typeof a === 'string' && typeof b === 'string' && a.toLowerCase() === b.toLowerCase();
export async function verifyMinedReceipts({ request, chainId, transactionHashes, minConfirmations = 12 }) {
  if (typeof request !== 'function') throw new Error('RPC request function required');
  if (typeof chainId !== 'string' || !/^[1-9][0-9]*$/.test(chainId))
    throw new Error('Expected decimal chainId required');
  if (!Number.isSafeInteger(minConfirmations) || minConfirmations < 1)
    throw new Error('minConfirmations must be a positive safe integer');
  if (!Array.isArray(transactionHashes) || !transactionHashes.length)
    throw new Error('Transaction hashes required');
  const ids = transactionHashes.map(h => {
    if (!hash(h)) throw new Error('Invalid transaction hash');
    return h.toLowerCase();
  });
  if (new Set(ids).size !== ids.length) throw new Error('Duplicate transaction hashes');
  const rpcChain = hex(await request('eth_chainId', []), 'chainId');
  if (rpcChain !== BigInt(chainId)) throw new Error('RPC chain mismatch');
  const tip = hex(await request('eth_blockNumber', []), 'blockNumber');
  const verified = [];
  for (const id of ids) {
    const r = await request('eth_getTransactionReceipt', [id]);
    if (!r || !same(r.transactionHash, id) || r.status !== '0x1' ||
        !hash(r.blockHash) || r.blockNumber === undefined ||
        r.gasUsed === undefined || r.effectiveGasPrice === undefined)
      throw new Error('Missing, failed, or incomplete mined receipt');
    const height = hex(r.blockNumber, 'receipt.blockNumber');
    hex(r.gasUsed, 'receipt.gasUsed');
    hex(r.effectiveGasPrice, 'receipt.effectiveGasPrice');
    if (height > tip || tip - height + 1n < BigInt(minConfirmations))
      throw new Error('Receipt has insufficient confirmations');
    const canonical = await request('eth_getBlockByNumber', [r.blockNumber, false]);
    if (!canonical || !same(canonical.hash, r.blockHash) || hex(canonical.number, 'canonical.number') !== height)
      throw new Error('Receipt block is not canonical at verification time');
    const tx = await request('eth_getTransactionByHash', [id]);
    if (!tx || !same(tx.hash, id) || !same(tx.blockHash, r.blockHash) ||
        hex(tx.blockNumber, 'transaction.blockNumber') !== height)
      throw new Error('Transaction inclusion mismatch');
    verified.push({...r, verifiedChainId: chainId, confirmations: (tip-height+1n).toString()});
  }
  return verified;
}
