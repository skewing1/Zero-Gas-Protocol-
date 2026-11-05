const methods = new Set([
  'eth_chainId', 'eth_getBlockByNumber', 'eth_getCode', 'eth_call', 'eth_getBalance',
  'eth_getTransactionCount', 'eth_gasPrice', 'eth_maxPriorityFeePerGas', 'eth_estimateGas',
]);
export function readOnlyRpc(url) {
  let id = 0;
  return async (method, ...params) => {
    if (!methods.has(method)) throw new Error('Only read-only quoting RPC methods are permitted');
    const response = await fetch(url, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params }),
      signal: AbortSignal.timeout(15_000),
    });
    const payload = await response.json();
    if (!response.ok || payload.error) throw new Error(payload.error?.message ?? `RPC HTTP ${response.status}`);
    return payload.result;
  };
}
