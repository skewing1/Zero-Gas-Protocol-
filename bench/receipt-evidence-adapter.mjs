import { normalizeReceiptDataFee } from './l2-fee-evidence.mjs';
import { compareEquivalent } from './all-in-cost-gate.mjs';

// Converts unmodified RPC receipts into the strict cost-gate schema.
// This is not independent RPC authentication or recipient-balance verification.
export function withReceiptFeeEvidence(path) {
  if (!path || !Array.isArray(path.receipts) || !path.receipts.length)
    throw new Error('Missing receipts');
  if (typeof path.chainId !== 'string') throw new Error('Missing chainId');
  return {
    ...path,
    receipts: path.receipts.map((receipt) => {
      if (receipt.dataFeeWei !== undefined) throw new Error('Pre-populated dataFeeWei is not receipt evidence');
      if (receipt.effectiveGasPriceWei !== undefined) throw new Error('Normalized price field conflicts with raw receipt requirement');
      const fee = normalizeReceiptDataFee({ chainId: path.chainId, receipt });
      return { ...receipt, dataFeeWei: fee.dataFeeWei };
    })
  };
}
export function compareReceiptEvidence(baseline, candidate) {
  return compareEquivalent(withReceiptFeeEvidence(baseline), withReceiptFeeEvidence(candidate));
}
