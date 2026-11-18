// Read-only, dependency-free receipt identity audit. This checks RPC observations,
// not recipient outcomes, cost completeness, or independent provider provenance.
const hex = (v, n) => typeof v === 'string' && new RegExp('^0x[0-9a-fA-F]{' + n + '}$').test(v);
const quantity = v => typeof v === 'string' && /^0x(0|[1-9a-fA-F][0-9a-fA-F]*)$/.test(v);
function same(a,b) { return a.toLowerCase() === b.toLowerCase(); }
function assert(condition, message) { if (!condition) throw new Error(message); }
async function call(rpc, method, params) {
  const response = await rpc(method, params);
  assert(response && typeof response === 'object' && !response.error, method + ' RPC failure');
  // Accept a JSON-RPC envelope or a directly returned result from a test adapter.
  return Object.prototype.hasOwnProperty.call(response,'result') ? response.result : response;
}
export async function auditReceiptIdentity(rpc, expected) {
  assert(typeof rpc === 'function', 'Missing RPC transport');
  assert(expected && hex(expected.transactionHash,64), 'Invalid expected transaction hash');
  assert(expected && quantity(expected.chainId), 'Invalid expected chain ID');
  const chainId = await call(rpc, 'eth_chainId', []);
  assert(quantity(chainId) && BigInt(chainId) === BigInt(expected.chainId), 'Chain ID mismatch');
  const receipt = await call(rpc, 'eth_getTransactionReceipt', [expected.transactionHash]);
  assert(receipt && hex(receipt.transactionHash,64) && same(receipt.transactionHash,expected.transactionHash), 'Receipt transaction hash mismatch');
  assert(hex(receipt.blockHash,64) && quantity(receipt.blockNumber) && quantity(receipt.transactionIndex), 'Incomplete mined receipt identity');
  assert(receipt.status === '0x1', 'Receipt is not successful');
  assert(quantity(receipt.gasUsed) && quantity(receipt.effectiveGasPrice), 'Missing receipt execution fee evidence');
  const tx = await call(rpc, 'eth_getTransactionByHash', [expected.transactionHash]);
  assert(tx && hex(tx.hash,64) && same(tx.hash,expected.transactionHash), 'Transaction hash mismatch');
  assert(hex(tx.blockHash,64) && same(tx.blockHash,receipt.blockHash), 'Transaction block mismatch');
  assert(quantity(tx.blockNumber) && BigInt(tx.blockNumber) === BigInt(receipt.blockNumber), 'Transaction height mismatch');
  assert(quantity(tx.transactionIndex) && BigInt(tx.transactionIndex) === BigInt(receipt.transactionIndex), 'Transaction index mismatch');
  const block = await call(rpc, 'eth_getBlockByHash', [receipt.blockHash,false]);
  assert(block && hex(block.hash,64) && same(block.hash,receipt.blockHash), 'Block hash mismatch');
  assert(quantity(block.number) && BigInt(block.number) === BigInt(receipt.blockNumber), 'Block height mismatch');
  assert(Array.isArray(block.transactions), 'Block transaction list missing');
  const index = BigInt(receipt.transactionIndex);
  assert(index < BigInt(block.transactions.length), 'Transaction index out of range');
  assert(hex(block.transactions[Number(index)],64) && same(block.transactions[Number(index)],expected.transactionHash), 'Block transaction inclusion mismatch');
  const canonical = await call(rpc, 'eth_getBlockByNumber', [receipt.blockNumber,false]);
  assert(canonical && hex(canonical.hash,64) && same(canonical.hash,receipt.blockHash), 'Receipt block not canonical at observation time');
  assert(quantity(canonical.number) && BigInt(canonical.number) === BigInt(receipt.blockNumber), 'Canonical block height mismatch');
  const canonicalRecheck = await call(rpc, 'eth_getBlockByNumber', [receipt.blockNumber,false]);
  assert(canonicalRecheck && hex(canonicalRecheck.hash,64) && same(canonicalRecheck.hash,receipt.blockHash), 'Receipt block changed during audit');
  assert(quantity(canonicalRecheck.number) && BigInt(canonicalRecheck.number) === BigInt(receipt.blockNumber), 'Rechecked canonical block height mismatch');
  return Object.freeze({
    chainId: BigInt(chainId).toString(),
    transactionHash: expected.transactionHash.toLowerCase(),
    blockHash: receipt.blockHash.toLowerCase(),
    blockNumber: BigInt(receipt.blockNumber).toString(),
    gasUsed: BigInt(receipt.gasUsed).toString(),
    effectiveGasPrice: BigInt(receipt.effectiveGasPrice).toString(),
    executionFeeWei: (BigInt(receipt.gasUsed) * BigInt(receipt.effectiveGasPrice)).toString(),
    identityChecksPassed: true,
    independentlyVerified: false,
    outcomeVerified: false,
    costCoverageVerified: false
  });
}
