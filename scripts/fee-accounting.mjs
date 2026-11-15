// Exact integer fee accounting. Accepts canonical decimal strings and JSON-RPC hex quantities.
// All monetary outputs are decimal wei strings; no exchange-rate assumptions.
const uint = (value, name) => {
  if (typeof value !== 'string' || !(/^(0|[1-9][0-9]*)$/.test(value) || /^0x(?:0|[1-9a-fA-F][0-9a-fA-F]*)$/.test(value)))
    throw new TypeError(`${name} must be a canonical nonnegative decimal string or JSON-RPC hex quantity`);
  return BigInt(value);
};

export function receiptCost(receipt) {
  if (!receipt || !['0x1', '1'].includes(receipt.status))
    throw new Error('Only successful mined receipts may be costed');
  const gas = uint(receipt.gasUsed, 'gasUsed');
  const price = uint(receipt.effectiveGasPrice, 'effectiveGasPrice');
  // Rollups may expose l1Fee separately; verify the provider has not already
  // included it in effectiveGasPrice before enabling this accounting.
  const l1 = uint(receipt.l1Fee ?? '0', 'l1Fee');
  const blob = uint(receipt.blobFee ?? '0', 'blobFee');
  return (gas * price + l1 + blob).toString();
}

export function allInCost({ receipts, relayerWei = '0', proofWei = '0',
  infrastructureWei = '0', bridgingWei = '0', amortizedDeploymentWei = '0' }) {
  if (!Array.isArray(receipts)) throw new TypeError('receipts must be an array');
  const onchain = receipts.reduce((sum, receipt) => sum + BigInt(receiptCost(receipt)), 0n);
  const overhead = [
    ['relayerWei', relayerWei], ['proofWei', proofWei],
    ['infrastructureWei', infrastructureWei], ['bridgingWei', bridgingWei],
    ['amortizedDeploymentWei', amortizedDeploymentWei],
  ].reduce((sum, [name, value]) => sum + uint(value, name), 0n);
  return { onchainWei: onchain.toString(), overheadWei: overhead.toString(),
    totalWei: (onchain + overhead).toString(), transactionCount: receipts.length };
}

export function compareCosts(baseline, candidate) {
  const base = uint(baseline.totalWei, 'baseline.totalWei');
  const next = uint(candidate.totalWei, 'candidate.totalWei');
  if (base === 0n) throw new RangeError('Baseline cost must be positive');
  const savingsBasisPoints = (base - next) * 10000n / base;
  return { savingsBasisPoints: savingsBasisPoints.toString(),
    meets45Percent: savingsBasisPoints >= 4500n,
    deltaWei: (base - next).toString() };
}
