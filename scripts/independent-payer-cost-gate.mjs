// Strict offline economic comparison. Inputs are UNTRUSTED until independently
// reconciled with canonical RPC receipts and balance snapshots.
// No cross-chain wei summation: each comparison must use the same chain.
const UINT = /^(0|[1-9][0-9]*)$/;
function wei(value, name) {
  if (typeof value !== 'string' || !UINT.test(value)) throw new Error(name + ': canonical unsigned decimal wei required');
  return BigInt(value);
}
function canonicalAddress(value) {
  if (typeof value !== 'string' || !/^0x[0-9a-fA-F]{40}$/.test(value)) throw new Error('invalid address');
  return value.toLowerCase();
}
function balances(rows, label) {
  if (!Array.isArray(rows) || !rows.length) throw new Error(label + ': empty balances');
  const map = new Map();
  for (const row of rows) {
    const key = canonicalAddress(row.address);
    if (map.has(key)) throw new Error(label + ': duplicate address');
    map.set(key, wei(row.deltaWei, label + ' delta'));
  }
  return map;
}
function sameBalances(a, b, label) {
  if (a.size !== b.size) throw new Error(label + ': address set mismatch');
  for (const [address, amount] of a) {
    if (b.get(address) !== amount) throw new Error(label + ': unequal balance delta ' + address);
  }
}
function evaluatePath(path) {
  if (!path || !Number.isSafeInteger(path.chainId) || path.chainId <= 0) throw new Error('invalid chain');
  if (path.evidence !== 'unverified' && path.evidence !== 'rpc-attested') throw new Error('evidence label required');
  if (!Array.isArray(path.receipts) || !path.receipts.length) throw new Error('missing receipts');
  const seen = new Set();
  let onchain = 0n;
  for (const receipt of path.receipts) {
    if (!/^0x[0-9a-fA-F]{64}$/.test(receipt.hash ?? '') || seen.has(receipt.hash.toLowerCase())) throw new Error('invalid or duplicate hash');
    seen.add(receipt.hash.toLowerCase());
    if (receipt.status !== '0x1') throw new Error('failed or missing receipt status');
    if (receipt.chainId !== path.chainId) throw new Error('receipt chain mismatch');
    const execution = wei(receipt.gasUsed, 'gasUsed') * wei(receipt.effectiveGasPrice, 'effectiveGasPrice');
    const data = wei(receipt.l1FeeWei ?? '0', 'l1FeeWei');
    const blob = wei(receipt.blobFeeWei ?? '0', 'blobFeeWei');
    if (wei(receipt.totalFeeWei, 'totalFeeWei') !== execution + data + blob) throw new Error('receipt fee mismatch');
    onchain += execution + data + blob;
  }
  const categories = ['relayerWei','proofWei','infrastructureWei','bridgeWei','settlementWei'];
  let offchain = 0n;
  for (const category of categories) {
    if (!Object.hasOwn(path.operatingCosts ?? {}, category)) throw new Error('missing ' + category);
    offchain += wei(path.operatingCosts[category], category);
  }
  return { onchain, offchain, total: onchain + offchain, payer: balances(path.payerDebits, 'payer'), recipient: balances(path.recipientCredits, 'recipient') };
}
export function compareEquivalentPaths(baseline, candidate) {
  if (baseline.chainId !== candidate.chainId) throw new Error('cross-chain wei comparison forbidden; normalize using independently evidenced USD costs');
  if (baseline.asset !== candidate.asset || baseline.window !== candidate.window) throw new Error('asset/window mismatch');
  const a = evaluatePath(baseline), b = evaluatePath(candidate);
  sameBalances(a.payer, b.payer, 'payer');
  sameBalances(a.recipient, b.recipient, 'recipient');
  if (a.total === 0n) throw new Error('zero-cost baseline');
  const savingsBps = (a.total - b.total) * 10000n / a.total;
  return {
    chainId: baseline.chainId, asset: baseline.asset, window: baseline.window,
    baselineWei: a.total.toString(), candidateWei: b.total.toString(),
    baselineOnchainWei: a.onchain.toString(), candidateOnchainWei: b.onchain.toString(),
    baselineOperatingWei: a.offchain.toString(), candidateOperatingWei: b.offchain.toString(),
    savingsBps: savingsBps.toString(), meets45Percent: savingsBps >= 4500n,
    verified: false,
    warning: 'Offline comparison only. Receipt and balance inputs are not independently RPC-authenticated.'
  };
}
