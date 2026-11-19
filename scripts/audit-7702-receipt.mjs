#!/usr/bin/env node
// Read-only audit of a mined Prague EIP-7702 (type 0x04) transaction.
// Never signs, broadcasts, or transfers funds. Does not claim gas savings.
import assert from 'node:assert/strict';

export async function audit7702(rpc, hash) {
  assert(/^0x[0-9a-fA-F]{64}$/.test(hash), 'Expected 32-byte transaction hash');
  const [tx, receipt, rpcChainId] = await Promise.all([
    rpc('eth_getTransactionByHash', [hash]),
    rpc('eth_getTransactionReceipt', [hash]),
    rpc('eth_chainId', []),
  ]);
  assert(tx && receipt, 'Transaction or receipt not mined');
  assert(rpcChainId != null, 'Missing RPC chain identity');
  const observedChainId = BigInt(rpcChainId);
  assert(observedChainId > 0n, 'Invalid RPC chain identity');
  assert.equal(BigInt(tx.chainId), observedChainId, 'Transaction chain differs from RPC chain');
  assert.equal(BigInt(tx.type), 4n, 'Not an EIP-7702 transaction');
  assert.equal(BigInt(receipt.type), 4n, 'Receipt is not type 0x04');
  assert.equal(BigInt(receipt.status), 1n, 'EIP-7702 transaction reverted');
  assert.equal(tx.hash.toLowerCase(), hash.toLowerCase());
  assert.equal(receipt.transactionHash.toLowerCase(), hash.toLowerCase());
  assert(Array.isArray(tx.authorizationList) && tx.authorizationList.length > 0,
    'Missing EIP-7702 authorization list in mined transaction');
  for (const a of tx.authorizationList) {
    assert(/^0x[0-9a-fA-F]{40}$/.test(a.address), 'Invalid authorization delegate');
    for (const field of ['chainId', 'nonce', 'yParity', 'r', 's'])
      assert(a[field] != null, 'Incomplete authorization: ' + field);
    assert(BigInt(a.chainId) === 0n || BigInt(a.chainId) === observedChainId,
      'Authorization chain mismatch');
    assert(BigInt(a.yParity) === 0n || BigInt(a.yParity) === 1n, 'Invalid parity');
    // secp256k1 scalar validity: EIP-7702 authorization signatures must be
    // canonical low-s signatures, not merely nonzero byte strings.
    const curveN = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
    const r = BigInt(a.r), s = BigInt(a.s);
    assert(r > 0n && r < curveN, 'Authorization r outside secp256k1 range');
    assert(s > 0n && s <= curveN / 2n, 'Authorization s not canonical low-s');
    assert(BigInt(a.nonce) >= 0n, 'Negative authorization nonce');
  }
  // A receipt and transaction must identify the same mined block when the
  // provider exposes transaction block fields. Never infer zero from missing data.
  if (tx.blockHash != null)
    assert.equal(tx.blockHash.toLowerCase(), receipt.blockHash.toLowerCase(),
      'Transaction and receipt block hash mismatch');
  if (tx.blockNumber != null)
    assert.equal(BigInt(tx.blockNumber), BigInt(receipt.blockNumber),
      'Transaction and receipt block number mismatch');
  const block = await rpc('eth_getBlockByNumber', [receipt.blockNumber, false]);
  assert(block && BigInt(block.number ?? receipt.blockNumber) === BigInt(receipt.blockNumber) &&
    block.hash.toLowerCase() === receipt.blockHash.toLowerCase(),
    'Receipt block not canonical');
  assert(Array.isArray(block.transactions), 'Canonical block transaction list missing');
  const minedHashes = block.transactions.map(item =>
    typeof item === 'string' ? item.toLowerCase() : item?.hash?.toLowerCase());
  assert(minedHashes.includes(hash.toLowerCase()),
    'Transaction absent from canonical block');
  // The receipt index is consensus-position evidence. Check it against the
  // canonical block rather than merely testing that the hash appears somewhere.
  assert(receipt.transactionIndex != null, 'Missing receipt transaction index');
  const transactionIndex = BigInt(receipt.transactionIndex);
  assert(transactionIndex >= 0n && transactionIndex < BigInt(minedHashes.length),
    'Receipt transaction index outside canonical block');
  assert.equal(minedHashes[Number(transactionIndex)], hash.toLowerCase(),
    'Receipt transaction index does not match canonical block');
  if (tx.transactionIndex != null)
    assert.equal(BigInt(tx.transactionIndex), transactionIndex,
      'Transaction and receipt indices disagree');
  const gasUsed = BigInt(receipt.gasUsed);
  const effectiveGasPrice = BigInt(receipt.effectiveGasPrice);
  assert(gasUsed > 0n && effectiveGasPrice >= 0n, 'Invalid mined gas fields');
  const blobGas = BigInt(receipt.blobGasUsed ?? 0);
  assert(blobGas >= 0n, 'Negative blob gas');
  assert(blobGas === 0n || receipt.blobGasPrice != null, 'Blob fee missing');
  if (receipt.blobGasPrice != null) assert(BigInt(receipt.blobGasPrice) >= 0n, 'Negative blob price');
  const executionWei = gasUsed * effectiveGasPrice;
  const blobWei = blobGas * BigInt(receipt.blobGasPrice ?? 0);
  // L2 data fee absent from a receipt is UNKNOWN, not zero.
  const l1FeeKnown = receipt.l1Fee != null;
  const l1FeeWei = l1FeeKnown ? BigInt(receipt.l1Fee) : null;
  if (l1FeeKnown) assert(l1FeeWei >= 0n, 'Negative L1 data fee');
  return {
    transactionHash: hash, blockHash: block.hash,
    chainId: observedChainId.toString(),
    authorizationCount: tx.authorizationList.length,
    gasUsed: gasUsed.toString(),
    executionWei: executionWei.toString(),
    blobWei: blobWei.toString(),
    l1FeeWei: l1FeeWei?.toString() ?? null,
    observedReceiptFeeWei: (executionWei + blobWei + (l1FeeWei ?? 0n)).toString(),
    completeL2CostEvidence: l1FeeKnown,
    verifiedSavings: false,
  };
}

if (process.argv[1]?.endsWith('/audit-7702-receipt.mjs')) {
  const [url, hash] = process.argv.slice(2);
  assert(url && hash, 'Usage: node scripts/audit-7702-receipt.mjs <RPC_URL> <TX_HASH>');
  let id = 0;
  const rpc = async (method, params) => {
    const response = await fetch(url, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params }),
      signal: AbortSignal.timeout(15000),
    });
    assert(response.ok, method + ': HTTP ' + response.status);
    const body = await response.json();
    if (body.error) throw new Error(method + ': ' + body.error.message);
    return body.result;
  };
  console.log(JSON.stringify(await audit7702(rpc, hash), null, 2));
}
