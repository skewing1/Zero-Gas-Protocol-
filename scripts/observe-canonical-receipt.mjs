// Read-only canonical receipt observation. RPC is not a trustless proof.
// Supply an independent JSON-RPC transport: async (method, params) => result.
// Never signs, broadcasts, or treats an RPC observation as verified savings.
const HEX = /^0x(?:0|[1-9a-f][0-9a-f]*)$/;
const HASH = /^0x[0-9a-fA-F]{64}$/;
function quantity(value, name) {
  if (typeof value !== 'string' || !HEX.test(value)) throw new Error(name + ': invalid canonical hex quantity');
  return BigInt(value);
}
function hash(value, name) {
  if (typeof value !== 'string' || !HASH.test(value)) throw new Error(name + ': invalid hash');
  return value.toLowerCase();
}
export async function observeCanonicalReceipt({rpc, txHash, expectedChainId, minConfirmations = 12}) {
  if (typeof rpc !== 'function') throw new Error('RPC transport required');
  const tx = hash(txHash, 'txHash');
  if (!Number.isSafeInteger(minConfirmations) || minConfirmations < 1) throw new Error('invalid confirmations');
  if (typeof expectedChainId !== 'string' || !/^(0|[1-9][0-9]*)$/.test(expectedChainId)) throw new Error('invalid expected chain');
  const chainId = quantity(await rpc('eth_chainId', []), 'chainId');
  if (chainId !== BigInt(expectedChainId)) throw new Error('chain mismatch');
  const receipt = await rpc('eth_getTransactionReceipt', [tx]);
  if (!receipt || typeof receipt !== 'object') throw new Error('missing receipt');
  if (hash(receipt.transactionHash, 'receipt transactionHash') !== tx) throw new Error('transaction mismatch');
  if (quantity(receipt.status, 'status') !== 1n) throw new Error('transaction failed');
  const blockHash = hash(receipt.blockHash, 'blockHash');
  const blockNumber = quantity(receipt.blockNumber, 'blockNumber');
  const gasUsed = quantity(receipt.gasUsed, 'gasUsed');
  const price = quantity(receipt.effectiveGasPrice, 'effectiveGasPrice');
  const latest = quantity(await rpc('eth_blockNumber', []), 'latest block');
  if (latest < blockNumber || latest - blockNumber + 1n < BigInt(minConfirmations)) throw new Error('insufficient confirmations');
  const block = await rpc('eth_getBlockByNumber', ['0x' + blockNumber.toString(16), false]);
  if (!block || hash(block.hash, 'canonical block hash') !== blockHash || quantity(block.number, 'canonical block number') !== blockNumber) throw new Error('noncanonical receipt block');
  // Deliberately omit L2 data fees: provider-specific fields require chain-specific validation.
  // Do not use this result as an independently verified equivalent-outcome proof.
  return Object.freeze({
    chainId: chainId.toString(), txHash: tx, blockHash,
    blockNumber: blockNumber.toString(), confirmations: (latest - blockNumber + 1n).toString(),
    gasUsed: gasUsed.toString(), effectiveGasPriceWei: price.toString(),
    executionFeeWei: (gasUsed * price).toString(),
    evidenceLevel: 'SINGLE_RPC_CANONICAL_OBSERVATION_NOT_INDEPENDENTLY_VERIFIED',
    outcomeVerified: false, fullCostVerified: false, verifiedSavingsEligible: false
  });
}
