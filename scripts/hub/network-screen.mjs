import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import * as chains from '../../node/node_modules/viem/_esm/chains/index.js';
import { operatorFee } from '../../network/checkout/rollup-fees.mjs';

// This tool has no signer. RPC methods are explicitly restricted to reads.
const allowed = new Set(['eth_chainId', 'eth_getBlockByNumber', 'eth_getTransactionReceipt', 'eth_getCode', 'eth_call']);
const candidates = [
  ['mainnet', 'ethereum', 'evm'], ['pulsechain', 'pulsechain', 'evm'],
  ['gnosis', 'xdai', 'evm'], ['polygon', 'polygon-ecosystem-token', 'evm'],
  ['bsc', 'binancecoin', 'evm'], ['avalanche', 'avalanche-2', 'evm'],
  ['celo', 'celo', 'opstack'], ['base', 'ethereum', 'opstack'],
  ['optimism', 'ethereum', 'opstack'], ['arbitrum', 'ethereum', 'arbitrum'],
];
const selection = process.argv.find(arg => arg.startsWith('--chains='))?.split('=')[1].split(',');
if (selection) assert(selection.every(name => candidates.some(([key]) => key === name)), 'Unknown chain');
const count = 8;
const median = values => { const s = [...values].sort((a,b) => a < b ? -1 : a > b ? 1 : 0); return s.length % 2 ? s[s.length >> 1] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2n; };
const hex = n => '0x' + n.toString(16);
async function fetchJson(url, options = {}) {
  const response = await fetch(url, { ...options, signal: AbortSignal.timeout(12_000) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}
async function sample([key, priceId, model]) {
  const chain = chains[key];
  const url = process.env[`${key.toUpperCase()}_RPC_URL`] ?? chain.rpcUrls.default.http[0];
  const result = { name: chain.name, key, chainId: chain.id, symbol: chain.nativeCurrency.symbol, decimals: chain.nativeCurrency.decimals, rpc: new URL(url).origin, model, priceId, samples: [] };
  async function rpc(method, ...params) {
    assert(allowed.has(method), 'Read-only RPC guard');
    const response = await fetchJson(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
    if (response.error) throw new Error(`${method}: ${response.error.message}`);
    return response.result;
  }
  try {
    assert.equal(BigInt(await rpc('eth_chainId')), BigInt(chain.id));
    let head;
    try { head = await rpc('eth_getBlockByNumber', 'finalized', false); } catch {}
    result.headPolicy = head?.hash ? 'RPC finalized tag' : 'latest; finality unverified';
    head ??= await rpc('eth_getBlockByNumber', 'latest', false);
    assert(head?.hash, 'No head');
    result.head = { number: head.number, hash: head.hash, timestamp: head.timestamp };
    for (let offset = 0; offset < 24 && result.samples.length < count; offset++) {
      const block = await rpc('eth_getBlockByNumber', hex(BigInt(head.number) - BigInt(offset)), true);
      const txs = block.transactions.filter(tx => ['0x0', '0x2'].includes(tx.type) && tx.input === '0x' && tx.to && tx.from.toLowerCase() !== tx.to.toLowerCase() && BigInt(tx.value) > 0n && !tx.feeCurrency);
      for (const tx of txs.slice(0, 16)) {
        const receipt = await rpc('eth_getTransactionReceipt', tx.hash);
        if (receipt?.status !== '0x1' || receipt.blockHash !== block.hash) continue;
        if (model !== 'arbitrum' && BigInt(receipt.gasUsed) !== 21000n) continue;
        if (await rpc('eth_getCode', tx.to, block.number) !== '0x') continue;
        const execution = BigInt(receipt.gasUsed) * BigInt(receipt.effectiveGasPrice);
        let data = 0n, operator = 0n;
        if (model === 'opstack') {
          assert(receipt.l1Fee !== undefined, 'Receipt lacks L1 data fee');
          data = BigInt(receipt.l1Fee);
          operator = receipt.operatorFee !== undefined ? BigInt(receipt.operatorFee) : await operatorFee(rpc, BigInt(receipt.gasUsed), block.number);
        }
        // Arbitrum's receipt gas includes the parent-chain posting component.
        result.samples.push({ tx, receipt, blockTimestamp: block.timestamp, executionOrCombinedFee: execution.toString(), l1DataFee: data.toString(), operatorFee: operator.toString(), totalBaseUnits: (execution + data + operator).toString() });
        if (result.samples.length === count) break;
      }
    }
    assert(result.samples.length === count, `Only ${result.samples.length}/${count} comparable transfers in 24 blocks`);
    result.medianBaseUnits = median(result.samples.map(s => BigInt(s.totalBaseUnits))).toString();
    result.status = 'MEASURED';
  } catch (error) { result.status = 'INCOMPLETE'; result.error = error.message; }
  if (result.samples.length) result.medianBaseUnits = median(result.samples.map(s => BigInt(s.totalBaseUnits))).toString();
  return result;
}
const replayPath = process.argv.find(arg => arg.startsWith('--from-snapshot='))?.split('=')[1];
const snapshot = replayPath ? JSON.parse(readFileSync(replayPath, 'utf8')) : undefined;
const startedAt = snapshot?.startedAt ?? new Date().toISOString();
const results = snapshot?.results ?? await Promise.all(candidates.filter(([key]) => !selection || selection.includes(key)).map(async c => {
  const r = await sample(c); console.log(`${r.key}: ${r.status}${r.error ? ' — ' + r.error : ''}`); return r;
}));
const priceUrl = 'https://coins.llama.fi/prices/current/' + [...new Set(results.map(r => `coingecko:${r.priceId}`))].join(',');
let prices = snapshot?.prices, priceError = snapshot?.priceError;
if (!snapshot) { try { prices = await fetchJson(priceUrl); } catch (e) { priceError = e.message; } }
for (const r of results) {
  if (r.samples.length) r.medianBaseUnits = median(r.samples.map(s => BigInt(s.totalBaseUnits))).toString();
  r.priceQuote = prices?.coins?.[`coingecko:${r.priceId}`] ?? null;
  if (r.medianBaseUnits && r.priceQuote?.price > 0) r.approxMedianUsd = Number(r.medianBaseUnits) / 10 ** r.decimals * r.priceQuote.price;
}
const f = n => n === undefined ? 'NOT MEASURED' : n > 0 && n < 0.00000001 ? `$${n.toExponential(4)}` : `$${n.toFixed(8)}`;
const report = [
  '# Read-only EVM network fee screen', '', `Collected starting ${startedAt}. viem chain metadata: pinned 2.38.6. Target: eight successful plain native transfers per network, at most 24 blocks scanned. Partial medians are shown with INCOMPLETE status. No savings gate is evaluated by this screen. This is a bounded shortlist, not every EVM network.`,
  'No transactions were sent. Fee values come from historical receipts. USD amounts are approximate conversions using third-party price quotes; quote timestamps are retained. No positive cost is rounded to free or 100% savings. Small, potentially clustered samples do not establish typical fees. This is native-token transfer fee screening, not an equal-asset cross-chain workflow benchmark.', '',
  '| Network | Sample count | Median network fee (base units) | Approx. USD | Status |',
  '| --- | ---: | ---: | ---: | --- |',
  ...results.map(r => `| ${r.name} | ${r.samples.length} | ${r.medianBaseUnits ?? '—'} ${r.symbol} base units | ${f(r.approxMedianUsd)} | ${r.status} |`), '',
  ...results.map(r => `- ${r.name}: ${r.headPolicy ?? 'head unavailable'}; block ${r.head?.number ?? 'unavailable'}${r.error ? '; ' + r.error : ''}. Price quote: ${r.priceQuote ? new Date(r.priceQuote.timestamp * 1000).toISOString() : 'unavailable'}.`), '',
  'Execution, L1 data and operator fees are included for supported OP Stack receipts; incomplete oracle data is a failure, never silently zero. Arbitrum receipt gas already includes posting costs. Other sampled EVM networks use receipt gasUsed × effectiveGasPrice.',
  'Excluded: token transfers, stablecoin/native-token acquisition, bridge entry and exit, swaps/slippage, liquidity, identity, relayer overhead and protocol settlement. EIP-7702 support, wallet support and protocol bytecode compatibility are UNVERIFIED. Lower sampled network fees are not protocol-created savings or a deployment recommendation.', '',
  'Sources: https://gitlab.com/pulsechaincom/pulsechain-mainnet ; https://docs.gnosischain.com/about/networks/mainnet ; https://docs.celo.org/learn/network/overview ; https://docs.optimism.io/op-stack/transactions/fees ; https://docs.arbitrum.io/how-arbitrum-works/deep-dives/gas-and-fees . Other endpoint metadata comes from the pinned viem chain definitions and is checked against eth_chainId.', '',
].join('\n');
mkdirSync('bench', { recursive: true });
const raw = JSON.stringify({ startedAt, finishedAt: snapshot?.finishedAt ?? new Date().toISOString(), priceUrl, priceError, prices, results }, null, 2);
writeFileSync('bench/network-screen.json', raw);
writeFileSync('bench/network-screen.json.gz', gzipSync(raw));
writeFileSync('bench/network-screen.md', report);
console.log(report);
