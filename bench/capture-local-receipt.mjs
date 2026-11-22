// SPDX-License-Identifier: MIT
// Read-only local JSON-RPC receipt capture. Does not submit transactions or move funds.
import { captureReceipt } from './capture-canonical-receipt.mjs';

export function localRpc(url, { timeoutMs = 10000 } = {}) {
  const endpoint = new URL(url);
  if (endpoint.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(endpoint.hostname) ||
      endpoint.username || endpoint.password || endpoint.search || endpoint.hash) {
    throw Error('RPC must be an unauthenticated local HTTP endpoint');
  }
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 60000) throw Error('invalid timeout');
  let id = 0;
  return async (method, params) => {
    if (!/^eth_(chainId|getTransactionReceipt|getTransactionByHash|getBlockByNumber|blockNumber)$/.test(method))
      throw Error('RPC method not permitted');
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params }),
      signal: AbortSignal.timeout(timeoutMs)
    });
    if (!response.ok) throw Error('RPC HTTP error ' + response.status);
    const payload = await response.json();
    if (!payload || payload.jsonrpc !== '2.0' || payload.id !== id || !Object.hasOwn(payload, 'result') || payload.error)
      throw Error('invalid RPC response');
    return payload.result;
  };
}

export async function main(args = process.argv.slice(2)) {
  if (args.length < 1 || args.length > 4) throw Error('usage: node bench/capture-local-receipt.mjs TX_HASH [LOCAL_RPC_URL] [CHAIN_ID] [CONFIRMATIONS]');
  const [txHash, url = 'http://127.0.0.1:8545', chainId, depth = '1'] = args;
  if (!/^[1-9][0-9]*$/.test(depth) || Number(depth) > 1000) throw Error('invalid confirmations');
  if (chainId !== undefined && !/^[1-9][0-9]*$/.test(chainId)) throw Error('invalid chain ID');
  const result = await captureReceipt(localRpc(url), txHash, {
    confirmations: Number(depth),
    ...(chainId === undefined ? {} : { expectedChainId: BigInt(chainId) }),
    requireType4: true
  });
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  return result;
}

if (process.argv[1] && import.meta.url === new URL('file://' + process.argv[1]).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
