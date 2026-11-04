import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { createMerchant } from './merchant.mjs';

const rpcUrl = 'http://127.0.0.1:8545';
async function rpc(method, ...params) {
  const response = await fetch(rpcUrl, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    signal: AbortSignal.timeout(5_000),
  });
  const { result, error } = await response.json();
  if (!response.ok || error) throw new Error(error?.message ?? 'Local RPC unavailable');
  return result;
}

if (BigInt(await rpc('eth_chainId')) !== 31337n) throw new Error('Start a local Anvil on chain 31337');
const [, payee] = await rpc('eth_accounts');
const merchant = createMerchant(rpc, { payee, amountWei: 10n ** 15n, chainId: 31337 });
const assets = new Map([
  ['/', ['index.html', 'text/html']], ['/app.mjs', ['app.mjs', 'text/javascript']],
  ['/payment.mjs', ['payment.mjs', 'text/javascript']],
]);
function json(res, status, payload) {
  res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
  res.end(JSON.stringify(payload));
}
createServer(async (req, res) => {
  try {
    const asset = req.method === 'GET' && assets.get(req.url);
    if (asset) {
      const [file, contentType] = asset;
      res.writeHead(200, { 'content-type': contentType });
      res.end(await readFile(new URL(file, import.meta.url)));
      return;
    }
    if (req.method !== 'POST' || !['/quote', '/verify'].includes(req.url)) {
      return json(res, 404, { error: 'Not found' });
    }
    let body = '';
    for await (const chunk of req) {
      body += chunk;
      if (body.length > 4096) {
        json(res, 413, { error: 'Request too large' });
        return;
      }
    }
    const { payer, id, transactionHash } = JSON.parse(body);
    const result = req.url === '/quote' ? await merchant.quote(payer) : await merchant.verify(id, transactionHash);
    json(res, 200, result);
  } catch (error) {
    json(res, 400, { error: error.message });
  }
}).listen(8080, '127.0.0.1', () => console.log('Checkout available at http://127.0.0.1:8080'));
