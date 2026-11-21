// Local-only RPC receipt consistency checks. Does NOT authenticate recipient balances or all-in costs.
const hex = (v, name) => {
  if (typeof v !== 'string' || !/^0x[0-9a-fA-F]+$/.test(v)) throw Error(name + ' must be RPC hex');
  return BigInt(v);
};
const hash = (v, name) => {
  if (typeof v !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(v)) throw Error(name + ' must be 32-byte hash');
  return v.toLowerCase();
};
export async function inspectMinedReceipt(rpc, txHash, expectedChainId) {
  const txid = hash(txHash, 'transactionHash');
  const chainId = hex(await rpc('eth_chainId', []), 'chainId');
  if (chainId !== BigInt(expectedChainId)) throw Error('Unexpected chain ID');
  const receipt = await rpc('eth_getTransactionReceipt', [txid]);
  if (!receipt || hash(receipt.transactionHash, 'receipt hash') !== txid) throw Error('Receipt missing or mismatched');
  if (hex(receipt.status, 'status') !== 1n) throw Error('Transaction failed');
  const blockHash = hash(receipt.blockHash, 'receipt block hash');
  const block = await rpc('eth_getBlockByHash', [blockHash, false]);
  if (!block || hash(block.hash, 'block hash') !== blockHash) throw Error('Canonical block lookup failed');
  const number = hex(receipt.blockNumber, 'receipt block number');
  if (hex(block.number, 'block number') !== number) throw Error('Block height mismatch');
  if (!Array.isArray(block.transactions) || !block.transactions.some(h => hash(h, 'block transaction') === txid)) throw Error('Transaction absent from block');
  const canonical = await rpc('eth_getBlockByNumber', [receipt.blockNumber, false]);
  if (!canonical || hash(canonical.hash, 'canonical block hash') !== blockHash) throw Error('Receipt block is not canonical');
  const tx = await rpc('eth_getTransactionByHash', [txid]);
  if (!tx || hash(tx.hash, 'transaction hash') !== txid || hash(tx.blockHash, 'transaction block hash') !== blockHash) throw Error('Transaction inclusion mismatch');
  const gasUsed = hex(receipt.gasUsed, 'gasUsed');
  const effectiveGasPrice = hex(receipt.effectiveGasPrice, 'effectiveGasPrice');
  if (gasUsed === 0n) throw Error('Zero gas receipt');
  return {
    chainId: chainId.toString(), transactionHash: txid, blockHash, blockNumber: number.toString(),
    transactionType: hex(receipt.type ?? tx.type, 'transaction type').toString(),
    status: 'success', gasUsed: gasUsed.toString(), effectiveGasPriceWei: effectiveGasPrice.toString(),
    executionFeeWei: (gasUsed * effectiveGasPrice).toString(),
    // RPC inclusion is not independent chain consensus verification. No L1 data, blob,
    // relayer, deployment, settlement or outcome values are inferred here.
    verifiedAllIn: false, recipientOutcomesVerified: false
  };
}
export function localRpc(endpoint) {
  const url = new URL(endpoint);
  if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) || url.username || url.password) {
    throw Error('Only unauthenticated loopback HTTP RPC is permitted');
  }
  let id = 0;
  return async (method, params) => {
    const response = await fetch(url, {method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:++id,method,params})});
    if (!response.ok) throw Error('RPC HTTP ' + response.status);
    const body = await response.json();
    if (body.error || !('result' in body)) throw Error('RPC error for ' + method);
    return body.result;
  };
}
if (process.argv[1]?.endsWith('inspect-local-receipt.mjs') && process.argv[2]) {
  const [endpoint, txHash, chainId] = process.argv.slice(2);
  try { console.log(JSON.stringify(await inspectMinedReceipt(localRpc(endpoint),txHash,chainId),null,2)); }
  catch (e) { console.error(e.message); process.exitCode = 1; }
}
