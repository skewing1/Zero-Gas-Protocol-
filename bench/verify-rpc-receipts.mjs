// Read-only RPC evidence verification. No transaction signing, broadcasting, or paid endpoints.
const hex = (v, field) => {
  if (typeof v !== 'string' || !/^0x(?:0|[1-9a-fA-F][0-9a-fA-F]*)$/.test(v))
    throw new Error('Invalid RPC quantity: ' + field);
  return BigInt(v);
};
const hash = (v) => typeof v === 'string' && /^0x[0-9a-fA-F]{64}$/.test(v);
const same = (a,b) => typeof a === 'string' && typeof b === 'string' && a.toLowerCase() === b.toLowerCase();

// Structural evidence only: signature recovery and delegation state are NOT verified here.
const validateAuthorization = (auth, expectedChain) => {
  if (!auth || typeof auth !== 'object' || Array.isArray(auth))
    throw new Error('Invalid EIP-7702 authorization tuple');
  const authChain = hex(auth.chainId, 'authorization.chainId');
  if (authChain !== 0n && authChain !== expectedChain)
    throw new Error('EIP-7702 authorization chain mismatch');
  if (typeof auth.address !== 'string' || !/^0x[0-9a-fA-F]{40}$/.test(auth.address))
    throw new Error('Invalid EIP-7702 authorization delegate address');
  hex(auth.nonce, 'authorization.nonce');
  const parity = hex(auth.yParity, 'authorization.yParity');
  if (parity !== 0n && parity !== 1n) throw new Error('Invalid EIP-7702 yParity');
  const r = hex(auth.r, 'authorization.r'), sigS = hex(auth.s, 'authorization.s');
  const curveN = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
  if (r === 0n || r >= curveN || sigS === 0n || sigS > curveN / 2n)
    throw new Error('Invalid EIP-7702 signature scalar');
};
export async function verifyMinedReceipts({ request, chainId, transactionHashes, minConfirmations = 12, requireEip7702 = false }) {
  if (typeof requireEip7702 !== 'boolean') throw new Error('requireEip7702 must be boolean');
  if (typeof request !== 'function') throw new Error('RPC request function required');
  if (typeof chainId !== 'string' || !/^[1-9][0-9]*$/.test(chainId))
    throw new Error('Expected decimal chainId required');
  if (!Number.isSafeInteger(minConfirmations) || minConfirmations < 1)
    throw new Error('minConfirmations must be a positive safe integer');
  if (!Array.isArray(transactionHashes) || !transactionHashes.length)
    throw new Error('Transaction hashes required');
  const ids = transactionHashes.map(h => {
    if (!hash(h)) throw new Error('Invalid transaction hash');
    return h.toLowerCase();
  });
  if (new Set(ids).size !== ids.length) throw new Error('Duplicate transaction hashes');
  const rpcChain = hex(await request('eth_chainId', []), 'chainId');
  if (rpcChain !== BigInt(chainId)) throw new Error('RPC chain mismatch');
  const tip = hex(await request('eth_blockNumber', []), 'blockNumber');
  const verified = [];
  for (const id of ids) {
    const r = await request('eth_getTransactionReceipt', [id]);
    if (!r || !same(r.transactionHash, id) || r.status !== '0x1' ||
        !hash(r.blockHash) || r.blockNumber === undefined ||
        r.gasUsed === undefined || r.effectiveGasPrice === undefined)
      throw new Error('Missing, failed, or incomplete mined receipt');
    const height = hex(r.blockNumber, 'receipt.blockNumber');
    hex(r.gasUsed, 'receipt.gasUsed');
    hex(r.effectiveGasPrice, 'receipt.effectiveGasPrice');
    if (height > tip || tip - height + 1n < BigInt(minConfirmations))
      throw new Error('Receipt has insufficient confirmations');
    const canonical = await request('eth_getBlockByNumber', [r.blockNumber, false]);
    if (!canonical || !same(canonical.hash, r.blockHash) || hex(canonical.number, 'canonical.number') !== height)
      throw new Error('Receipt block is not canonical at verification time');
    // Confirm the receipt's indexed transaction is actually in the canonical block.
    // Block-by-number with fullTransactions=false must return transaction hashes.
    const position = hex(r.transactionIndex, 'receipt.transactionIndex');
    if (!Array.isArray(canonical.transactions) || position >= BigInt(canonical.transactions.length) ||
        !same(canonical.transactions[Number(position)], id))
      throw new Error('Receipt transaction not present at canonical block index');
    const tx = await request('eth_getTransactionByHash', [id]);
    if (!tx || !same(tx.hash, id) || !same(tx.blockHash, r.blockHash) ||
        hex(tx.blockNumber, 'transaction.blockNumber') !== height ||
        hex(tx.transactionIndex, 'transaction.transactionIndex') !== position)
      throw new Error('Transaction inclusion mismatch');
    if (requireEip7702) {
      if (hex(tx.type, 'transaction.type') !== 4n ||
          hex(tx.chainId, 'transaction.chainId') !== BigInt(chainId) ||
          !Array.isArray(tx.authorizationList) || tx.authorizationList.length === 0)
        throw new Error('Expected mined EIP-7702 type-4 transaction with authorization list');
      for (const authorization of tx.authorizationList) validateAuthorization(authorization, BigInt(chainId));
      if (r.type !== undefined && hex(r.type, 'receipt.type') !== 4n)
        throw new Error('Receipt and transaction type mismatch');
    }
    verified.push({...r, verifiedChainId: chainId, confirmations: (tip-height+1n).toString()});
  }
  // Recheck after sequential RPC calls to reject a mid-verification reorganization.
  const finalTip = hex(await request('eth_blockNumber', []), 'final.blockNumber');
  for (const receipt of verified) {
    const height = hex(receipt.blockNumber, 'receipt.blockNumber');
    if (height > finalTip || finalTip - height + 1n < BigInt(minConfirmations))
      throw new Error('Receipt lost confirmations during verification');
    const block = await request('eth_getBlockByNumber', [receipt.blockNumber, false]);
    if (!block || !same(block.hash, receipt.blockHash) ||
        hex(block.number, 'final.canonical.number') !== height)
      throw new Error('Receipt block reorganized during verification');
    // Re-read receipt after canonicality checks: do not accept evidence whose
    // inclusion, status, or billed execution cost changed during verification.
    const finalReceipt = await request('eth_getTransactionReceipt', [receipt.transactionHash]);
    if (!finalReceipt || !same(finalReceipt.transactionHash, receipt.transactionHash) ||
        finalReceipt.status !== receipt.status ||
        !same(finalReceipt.blockHash, receipt.blockHash) ||
        hex(finalReceipt.blockNumber, 'final.receipt.blockNumber') !== height ||
        hex(finalReceipt.transactionIndex, 'final.receipt.transactionIndex') !==
          hex(receipt.transactionIndex, 'receipt.transactionIndex') ||
        hex(finalReceipt.gasUsed, 'final.receipt.gasUsed') !==
          hex(receipt.gasUsed, 'receipt.gasUsed') ||
        hex(finalReceipt.effectiveGasPrice, 'final.receipt.effectiveGasPrice') !==
          hex(receipt.effectiveGasPrice, 'receipt.effectiveGasPrice') ||
        (requireEip7702 && hex(finalReceipt.type, 'final.receipt.type') !== 4n))
      throw new Error('Receipt changed during final verification');
    receipt.confirmations = (finalTip - height + 1n).toString();
  }
  // Detect a provider/network switch during multi-request evidence collection.
  const finalChain = hex(await request('eth_chainId', []), 'final.chainId');
  if (finalChain !== BigInt(chainId)) throw new Error('RPC chain changed during verification');
  return verified;
}
