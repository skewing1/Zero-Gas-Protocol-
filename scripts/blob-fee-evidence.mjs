// Normalize RPC fee evidence without silently dropping EIP-4844 blob costs.
export function blobFeeFromReceipt(receipt) {
  const used = receipt.blobGasUsed;
  const price = receipt.blobGasPrice;
  if ((used == null) !== (price == null))
    throw new Error('Incomplete blob fee evidence: both blobGasUsed and blobGasPrice required');
  if (used == null) return undefined;
  const quantity = (value, label) => {
    if (typeof value !== 'string' || !/^(0x(?:0|[1-9a-fA-F][0-9a-fA-F]*)|0|[1-9][0-9]*)$/.test(value))
      throw new TypeError(label + ' must be an unsigned quantity');
    return BigInt(value);
  };
  return (quantity(used, 'blobGasUsed') * quantity(price, 'blobGasPrice')).toString();
}
