import { reconcileReceiptCost } from './receipt-cost-reconciliation.mjs';

// Convert chain-specific receipt accounting into the savings gate's common fee schema.
// This is an accounting adapter, NOT a receipt, balance, finality, or cost-coverage verifier.
function add(a,b) { return (BigInt(a)+BigInt(b)).toString(); }
export function prepareReceiptCosts(chainId, observations, extraCosts = {}) {
  if (!extraCosts || typeof extraCosts !== 'object' || Array.isArray(extraCosts)) throw new Error('Invalid extra costs');
  const keys = ['relayerWei','rpcWei','authorizationWei','deploymentWei','settlementWei','liquidityWei','dataWei','otherWei'];
  for (const key of Object.keys(extraCosts)) if (!keys.includes(key)) throw new Error('Unknown extra cost: '+key);
  for (const [key,value] of Object.entries(extraCosts)) if (typeof value !== 'string' || !/^(0|[1-9][0-9]*)$/.test(value)) throw new Error('Invalid extra cost: '+key);
  if (!Array.isArray(observations) || observations.length === 0) throw new Error('Missing receipt observations');
  const hashes = new Set();
  let additionalDataWei = '0';
  const receipts = observations.map((item) => {
    if (!item || !item.receipt || typeof item.hash !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(item.hash)) throw new Error('Missing transaction identity');
    const hash = item.hash.toLowerCase();
    if (item.receipt.transactionHash !== undefined && (typeof item.receipt.transactionHash !== 'string' || item.receipt.transactionHash.toLowerCase() !== hash)) throw new Error('Receipt transaction hash mismatch');
    if (hashes.has(hash)) throw new Error('Duplicate transaction identity');
    hashes.add(hash);
    const { receipt, fees = {} } = item;
    const result = reconcileReceiptCost(chainId, receipt, fees);
    // The gate charges gasUsed * effectiveGasPrice itself. Do not include
    // executionWei again in l1FeeWei, blobFeeWei, or extraCosts.
    additionalDataWei = add(additionalDataWei, result.additionalDataFeeWei);
    return Object.freeze({
      hash, status: receipt.status,
      gasUsed: BigInt(receipt.gasUsed).toString(),
      effectiveGasPrice: BigInt(receipt.effectiveGasPrice).toString(),
      l1FeeWei: result.l1FeeWei,
      blobFeeWei: result.blobFeeWei
    });
  });
  return Object.freeze({
    chainId, receipts: Object.freeze(receipts),
    additionalDataWei,
    // Feed separate data fees into the savings gate rather than silently omitting them.
    // Explicit dataWei is an additional, non-overlapping expense supplied by the caller.
    extraCosts: Object.freeze(Object.fromEntries(keys.map(key => [key, key === 'dataWei' ? add(extraCosts.dataWei ?? '0', additionalDataWei) : (extraCosts[key] ?? '0')]))),
    // Explicitly false: observations and supplied fee amounts are not independently audited.
    receiptsVerified: false, outcomeVerified: false, costCoverageVerified: false,
    independentlyVerified: false
  });
}
