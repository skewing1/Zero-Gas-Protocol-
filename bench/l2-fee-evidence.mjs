// Strict read-only fee normalization for supported receipt shapes.
// Does not authenticate RPC data, verify payments, or estimate offchain fees.
const quantity = (v, name) => {
  if (typeof v !== 'string' || !/^(0x(?:0|[1-9a-fA-F][0-9a-fA-F]*)|0|[1-9][0-9]*)$/.test(v))
    throw new Error(`${name} must be a canonical nonnegative quantity string`);
  return BigInt(v);
};
export function normalizeReceiptDataFee({ chainId, receipt }) {
  if (!receipt || typeof receipt !== 'object') throw new Error('Missing receipt');
  const chain = quantity(chainId, 'chainId');
  const gasUsed = quantity(receipt.gasUsed, 'gasUsed');
  const effectiveGasPrice = quantity(receipt.effectiveGasPrice, 'effectiveGasPrice');
  const executionWei = gasUsed * effectiveGasPrice;
  if (chain === 1n || chain === 11155111n) {
    if (receipt.l1Fee !== undefined || receipt.gasUsedForL1 !== undefined)
      throw new Error('Unexpected rollup fee fields on Ethereum receipt');
    return { executionWei: executionWei.toString(), dataFeeWei: '0', feeModel: 'ethereum-execution' };
  }
  if (chain === 8453n || chain === 84532n) {
    if (receipt.l1Fee === undefined) throw new Error('Base receipt requires l1Fee evidence');
    if (receipt.gasUsedForL1 !== undefined) throw new Error('Conflicting L2 fee schemas');
    const l1Fee = quantity(receipt.l1Fee, 'l1Fee');
    return { executionWei: executionWei.toString(), dataFeeWei: l1Fee.toString(), feeModel: 'base-l1-fee-separate' };
  }
  if (chain === 42161n || chain === 421614n) {
    if (receipt.gasUsedForL1 === undefined) throw new Error('Arbitrum receipt requires gasUsedForL1 evidence');
    if (receipt.l1Fee !== undefined) throw new Error('Conflicting L2 fee schemas');
    const gasUsedForL1 = quantity(receipt.gasUsedForL1, 'gasUsedForL1');
    if (gasUsedForL1 > gasUsed) throw new Error('Arbitrum L1 gas component exceeds total gasUsed');
    return { executionWei: executionWei.toString(), dataFeeWei: '0', embeddedL1Wei: (gasUsedForL1 * effectiveGasPrice).toString(), feeModel: 'arbitrum-l1-embedded' };
  }
  throw new Error('Unsupported chain fee model; no default zero-data-fee assumption');
}
