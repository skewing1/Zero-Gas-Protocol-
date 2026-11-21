// SPDX-License-Identifier: MIT
// Offline evidence gate. Amounts are integer wei, never floating point.
// Input schema: {baseline:{chainId, recipients:[{address,deltaWei}], transactions:[{hash,status,gasUsed,effectiveGasPrice,from,to}], extras:{relayerWei,dataWei,settlementWei,authorizationWei,deploymentWei}},
// candidate: same shape}. Extras are additional costs NOT already in receipts.
// No implicit pricing assumptions, no exchange-rate conversion, no RPC calls.
const UINT = /^(0|[1-9][0-9]*)$/;
const HASH = /^0x[0-9a-fA-F]{64}$/;
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
function uint(v, label) {
  if (typeof v !== 'string' || !UINT.test(v)) throw Error(label + ': expected unsigned decimal wei string');
  return BigInt(v);
}
function address(v, label) {
  if (typeof v !== 'string' || !ADDRESS.test(v)) throw Error(label + ': invalid address');
  return v.toLowerCase();
}
function evaluate(side, label) {
  if (!side || typeof side !== 'object' || !Array.isArray(side.recipients) || !side.recipients.length ||
      !Array.isArray(side.transactions) || !side.transactions.length) throw Error(label + ': missing evidence');
  const chainId = uint(side.chainId, label + '.chainId');
  if (chainId === 0n) throw Error(label + ': invalid chainId');
  const recipients = new Map();
  for (const [i,r] of side.recipients.entries()) {
    const a = address(r.address, label + '.recipients[' + i + ']');
    if (recipients.has(a)) throw Error(label + ': duplicate recipient');
    recipients.set(a, uint(r.deltaWei, label + '.deltaWei'));
  }
  const hashes = new Set();
  let receiptWei = 0n;
  for (const [i,t] of side.transactions.entries()) {
    if (!t || typeof t !== 'object' || !HASH.test(t.hash || '') || hashes.has(t.hash.toLowerCase()))
      throw Error(label + ': invalid/duplicate transaction hash');
    hashes.add(t.hash.toLowerCase());
    if (t.status !== '0x1') throw Error(label + ': failed/unconfirmed transaction');
    address(t.from, label + '.from');
    if (t.to !== null) address(t.to, label + '.to');
    const gas = uint(t.gasUsed, label + '.gasUsed');
    const price = uint(t.effectiveGasPrice, label + '.effectiveGasPrice');
    if (gas === 0n || price === 0n) throw Error(label + ': missing gas or price');
    receiptWei += gas * price;
  }
  if (!side.extras || typeof side.extras !== 'object') throw Error(label + ': missing extras');
  let extraWei = 0n;
  for (const field of ['relayerWei','dataWei','settlementWei','authorizationWei','deploymentWei']) {
    extraWei += uint(side.extras[field], label + '.extras.' + field);
  }
  return {chainId, recipients, hashes, receiptWei, extraWei, totalWei:receiptWei + extraWei};
}
export function compareEvidence(input) {
  if (!input || typeof input !== 'object') throw Error('missing evidence');
  const b = evaluate(input.baseline, 'baseline'), c = evaluate(input.candidate, 'candidate');
  if (b.chainId !== c.chainId) throw Error('chain mismatch: compare separately with explicit FX conversions');
  // A receipt cannot independently prove both the baseline and candidate execution.
  for (const hash of b.hashes) {
    if (c.hashes.has(hash)) throw Error('cross-side duplicate transaction hash: non-independent evidence');
  }
  if (b.recipients.size !== c.recipients.size) throw Error('recipient count mismatch');
  for (const [a,delta] of b.recipients) {
    if (!c.recipients.has(a) || c.recipients.get(a) !== delta) throw Error('recipient outcome mismatch: ' + a);
  }
  if (b.totalWei === 0n) throw Error('zero baseline cost');
  const saved = b.totalWei - c.totalWei;
  return {
    chainId:b.chainId.toString(), baselineWei:b.totalWei.toString(),
    candidateWei:c.totalWei.toString(), savedWei:saved.toString(),
    // basis points, truncated toward zero; negative means candidate is more expensive
    savingsBasisPoints:(saved * 10000n / b.totalWei).toString(),
    exceeds45Percent: saved * 100n > b.totalWei * 45n,
    limitations:'Caller-provided evidence only; does not authenticate receipts, verify balance deltas, or price omitted offchain costs.'
  };
}
