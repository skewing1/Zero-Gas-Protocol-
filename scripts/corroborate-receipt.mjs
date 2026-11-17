// Read-only agreement check across two independently supplied JSON-RPC transports.
// Agreement is corroboration, NOT proof of independent providers, economic finality,
// delivered balances, L2 data charges, or verified savings.
import {observeCanonicalReceipt} from './observe-canonical-receipt.mjs';

export async function corroborateReceipt({rpcA, rpcB, txHash, expectedChainId, minConfirmations = 12}) {
  if (typeof rpcA !== 'function' || typeof rpcB !== 'function' || rpcA === rpcB) {
    throw new Error('two distinct RPC transport functions required');
  }
  // Both observations must succeed. A failing or disagreeing endpoint fails closed.
  const [a, b] = await Promise.all([
    observeCanonicalReceipt({rpc:rpcA, txHash, expectedChainId, minConfirmations}),
    observeCanonicalReceipt({rpc:rpcB, txHash, expectedChainId, minConfirmations})
  ]);
  const fields = ['chainId', 'txHash', 'blockHash', 'blockNumber', 'gasUsed', 'effectiveGasPriceWei', 'executionFeeWei'];
  for (const field of fields) {
    if (a[field] !== b[field]) throw new Error('RPC disagreement: ' + field);
  }
  const confirmations = BigInt(a.confirmations) < BigInt(b.confirmations) ? a.confirmations : b.confirmations;
  return Object.freeze({
    chainId: a.chainId, txHash: a.txHash, blockHash: a.blockHash,
    blockNumber: a.blockNumber, gasUsed: a.gasUsed,
    effectiveGasPriceWei: a.effectiveGasPriceWei, executionFeeWei: a.executionFeeWei,
    minimumObservedConfirmations: confirmations,
    evidenceLevel: 'TWO_RPC_AGREEMENT_PROVIDER_INDEPENDENCE_NOT_ATTESTED',
    outcomeVerified: false, fullCostVerified: false, verifiedSavingsEligible: false
  });
}
