// Strict receipt evidence checks for local Anvil benchmarks.
// This is NOT independent RPC attestation or a proof of recipient outcomes.
const quantity = (value, name) => {
  if (typeof value !== 'string' || !/^0x(?:0|[1-9a-f][0-9a-f]*)$/i.test(value))
    throw new Error(name + ': noncanonical RPC quantity');
  return BigInt(value);
};
const hash = (value, name) => {
  if (typeof value !== 'string' || !/^0x[0-9a-f]{64}$/i.test(value))
    throw new Error(name + ': invalid hash');
  return value.toLowerCase();
};
export function verifyMinedReceipt(receipt, transaction, requestedHash, chainId) {
  if (!receipt || !transaction) throw new Error('missing receipt or transaction');
  const txHash = hash(requestedHash, 'requestedHash');
  if (hash(receipt.transactionHash, 'receipt hash') !== txHash ||
      hash(transaction.hash, 'transaction hash') !== txHash)
    throw new Error('transaction hash mismatch');
  if (quantity(receipt.status, 'status') !== 1n) throw new Error('failed receipt');
  if (quantity(receipt.blockNumber, 'blockNumber') < 1n)
    throw new Error('not mined');
  if (hash(receipt.blockHash, 'blockHash') !== hash(transaction.blockHash, 'transaction blockHash'))
    throw new Error('block mismatch');
  if (quantity(transaction.chainId, 'chainId') !== BigInt(chainId))
    throw new Error('chain mismatch');
  const gasUsed = quantity(receipt.gasUsed, 'gasUsed');
  const effectiveGasPrice = quantity(receipt.effectiveGasPrice, 'effectiveGasPrice');
  if (gasUsed === 0n || effectiveGasPrice === 0n) throw new Error('invalid gas accounting');
  const l1Fee = receipt.l1Fee == null ? 0n : quantity(receipt.l1Fee, 'l1Fee');
  const blobGasUsed = receipt.blobGasUsed == null ? 0n : quantity(receipt.blobGasUsed, 'blobGasUsed');
  const blobGasPrice = receipt.blobGasPrice == null ? 0n : quantity(receipt.blobGasPrice, 'blobGasPrice');
  if ((receipt.blobGasUsed == null) !== (receipt.blobGasPrice == null))
    throw new Error('incomplete blob fee');
  return { gasUsed, effectiveGasPrice, l1Fee, blobFee: blobGasUsed * blobGasPrice,
    feeWei: gasUsed * effectiveGasPrice + l1Fee + blobGasUsed * blobGasPrice };
}
