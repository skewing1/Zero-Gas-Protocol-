// Conservative per-chain fee reconciliation. Observations are not independent verification.
const decimal = /^(0|[1-9][0-9]*)$/;
const wei = (v, name) => { if (typeof v !== 'string' || !decimal.test(v)) throw new Error('Invalid '+name); return BigInt(v); };
const hexQuantity = v => typeof v === 'string' && /^0x(0|[1-9a-fA-F][0-9a-fA-F]*)$/.test(v);
const hexWei = (v, name) => { if (!hexQuantity(v)) throw new Error('Missing or invalid '+name); return BigInt(v); };
export function reconcileReceiptCost(chainId, receipt, {l1FeeWei, blobFeeWei, additionalDataFeeWei} = {}) {
  if (!['1','8453','42161'].includes(chainId)) throw new Error('Unsupported chain');
  if (!receipt || receipt.status !== '0x1') throw new Error('Unsuccessful or missing receipt');
  const execution = hexWei(receipt.gasUsed,'gasUsed') * hexWei(receipt.effectiveGasPrice,'effectiveGasPrice');
  // Base exposes a separate L1 fee; Arbitrum's poster fee is normally included in gasUsed.
  // Never charge the same poster fee twice, and never infer missing Base L1 fee as zero.
  if (chainId === '8453' && l1FeeWei === undefined && receipt.l1Fee === undefined) throw new Error('Missing Base L1 data fee');
  if (chainId === '42161' && l1FeeWei !== undefined && wei(l1FeeWei,'l1FeeWei') !== 0n) throw new Error('Arbitrum L1 fee may already be included in gasUsed');
  const l1 = chainId === '8453' ? (l1FeeWei === undefined ? hexWei(receipt.l1Fee,'receipt.l1Fee') : wei(l1FeeWei,'l1FeeWei')) : (l1FeeWei === undefined ? 0n : wei(l1FeeWei,'l1FeeWei'));
  if (chainId === '8453' && receipt.l1Fee !== undefined && l1FeeWei !== undefined && hexWei(receipt.l1Fee,'receipt.l1Fee') !== l1) throw new Error('Conflicting Base L1 fees');
  // EIP-4844 blob fees are charged outside gasUsed * effectiveGasPrice.
  // Bind any supplied override to the actual mined receipt fields.
  const hasBlobGas = receipt.blobGasUsed !== undefined;
  const hasBlobPrice = receipt.blobGasPrice !== undefined;
  if (hasBlobGas !== hasBlobPrice) throw new Error('Incomplete native blob fee receipt fields');
  const nativeBlob = hasBlobGas ? hexWei(receipt.blobGasUsed,'blobGasUsed') * hexWei(receipt.blobGasPrice,'blobGasPrice') : 0n;
  const blob = blobFeeWei === undefined ? nativeBlob : wei(blobFeeWei,'blobFeeWei');
  if (blobFeeWei !== undefined && hasBlobGas && blob !== nativeBlob) throw new Error('Conflicting native blob fee');
  if (chainId === '1' && l1 !== 0n) throw new Error('Ethereum L1 data fee must not be added separately');
  const data = additionalDataFeeWei === undefined ? 0n : wei(additionalDataFeeWei,'additionalDataFeeWei');
  return Object.freeze({chainId,executionWei:execution.toString(),l1FeeWei:l1.toString(),blobFeeWei:blob.toString(),additionalDataFeeWei:data.toString(),totalObservedWei:(execution+l1+blob+data).toString(),costCoverageVerified:false,independentlyVerified:false});
}
