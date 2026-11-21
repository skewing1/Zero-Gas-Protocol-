// RPC-observed confirmation stability only; not independent consensus authentication.
const quantity = (v, label) => {
  if (typeof v !== 'string' || !/^0x(?:0|[1-9a-fA-F][0-9a-fA-F]*)$/.test(v)) throw Error(`${label} must be canonical RPC quantity`);
  return BigInt(v);
};
const hash = (v) => {
  if (typeof v !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(v)) throw Error('Invalid block hash');
  return v.toLowerCase();
};
const receiptHeight = (v) => {
  if (typeof v !== 'string' || !/^(?:0|[1-9][0-9]*)$/.test(v)) throw Error('Invalid receipt block number');
  return BigInt(v);
};
export async function checkReceiptConfirmations(rpc, receiptEvidence, minimumConfirmations = 12, expectedChainId = null) {
  if (!Number.isSafeInteger(minimumConfirmations) || minimumConfirmations < 1) throw Error('Invalid confirmation threshold');
  if (!receiptEvidence || receiptEvidence.status !== 'success') throw Error('Successful receipt evidence required');
  if (expectedChainId !== null) {
    if (typeof expectedChainId !== 'string' || !/^0x(?:0|[1-9a-fA-F][0-9a-fA-F]*)$/.test(expectedChainId)) throw Error('Expected chain ID must be canonical RPC quantity');
    const actualChainId = quantity(await rpc('eth_chainId', []), 'RPC chain ID');
    if (actualChainId !== BigInt(expectedChainId)) throw Error('RPC chain ID mismatch');
  }
  const blockNumber = receiptHeight(receiptEvidence.blockNumber);
  const expectedHash = hash(receiptEvidence.blockHash);
  const latest = quantity(await rpc('eth_blockNumber', []), 'latest block');
  if (latest < blockNumber) throw Error('Receipt block is above latest block');
  const confirmations = latest - blockNumber + 1n;
  if (confirmations < BigInt(minimumConfirmations)) throw Error('Insufficient confirmations');
  const assertCanonical = async () => {
    const block = await rpc('eth_getBlockByNumber', ['0x' + blockNumber.toString(16), false]);
    if (!block || hash(block.hash) !== expectedHash || quantity(block.number, 'canonical block number') !== blockNumber) throw Error('Canonical block changed');
  };
  await assertCanonical();
  // A second tip read detects a retreat/reorg during the asynchronous canonicality check.
  const latestAfter = quantity(await rpc('eth_blockNumber', []), 'latest block after check');
  if (latestAfter < latest) throw Error('Chain tip retreated during confirmation check');
  if (latestAfter < blockNumber || latestAfter - blockNumber + 1n < BigInt(minimumConfirmations)) throw Error('Insufficient confirmations after check');
  // Recheck after the tip read to detect a same-height reorg between RPC calls.
  await assertCanonical();
  // Chain identity can change between RPC reads (e.g. a local endpoint is repointed).
  // Recheck after all canonicality observations, not only before them.
  if (expectedChainId !== null) {
    const finalChainId = quantity(await rpc('eth_chainId', []), 'RPC chain ID after check');
    if (finalChainId !== BigInt(expectedChainId)) throw Error('RPC chain ID changed during confirmation check');
  }
  return {confirmations: confirmations.toString(), canonicalAtCheck: true, consensusAuthenticated: false, verifiedAllIn: false};
}
