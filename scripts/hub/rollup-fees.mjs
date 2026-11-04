import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { encodeFunctionData, keccak256, parseAbi, serializeTransaction, toHex } from '../../node/node_modules/viem/_esm/index.js';

const methods = new Set([
  'eth_chainId', 'eth_getBlockByNumber', 'eth_getBlockReceipts', 'eth_getTransactionByHash',
  'eth_getTransactionReceipt', 'eth_getLogs', 'eth_getCode', 'eth_call', 'eth_estimateGas',
]);
function reader(url) {
  return async (method, ...params) => {
    assert(methods.has(method), 'Only read-only RPC methods are permitted');
    const response = await fetch(url, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      signal: AbortSignal.timeout(35_000),
    });
    const { result, error } = await response.json();
    if (!response.ok || error) throw new Error(`${method}: ${error?.message ?? response.status}`);
    return result;
  };
}
const ethereum = reader(process.env.ETHEREUM_RPC_URL ?? 'https://ethereum-rpc.publicnode.com');
const base = reader(process.env.BASE_RPC_URL ?? 'https://base-rpc.publicnode.com');
const oracle = '0x420000000000000000000000000000000000000F';
const oracleAbi = parseAbi([
  'function getOperatorFee(uint256 gasUsed) view returns (uint256)',
  'function getL1FeeUpperBound(uint256 unsignedTxSize) view returns (uint256)',
]);
// Chain 8453, superchain-registry commit 5b055be4d294ce43814a44c8839d89b2436dc8aa.
const portal = '0x49048044D57e1C92A77f79988d21Fa8fAF74E97e';
const depositTopic = keccak256(toHex('TransactionDeposited(address,address,uint256,bytes)'));
const size = 8;
const lower = address => address?.toLowerCase();
const isPlain = tx => ['0x0', '0x2'].includes(tx.type) && tx.input === '0x' && tx.to &&
  lower(tx.from) !== lower(tx.to) && BigInt(tx.value) > 0n;
const median = values => {
  const sorted = [...values].sort((a, b) => a < b ? -1 : a > b ? 1 : 0);
  const middle = sorted.length >> 1;
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2n;
};
async function oracleCall(method, args, block) {
  const data = encodeFunctionData({ abi: oracleAbi, functionName: method, args });
  return BigInt(await base('eth_call', { to: oracle, data }, block));
}
function executionFee(receipt) {
  assert.equal(receipt.status, '0x1');
  return BigInt(receipt.gasUsed) * BigInt(receipt.effectiveGasPrice);
}
async function sample(rpc, chainId) {
  assert.equal(BigInt(await rpc('eth_chainId')), BigInt(chainId));
  const finalized = await rpc('eth_getBlockByNumber', 'finalized', false);
  assert(finalized?.hash, 'Finalized head unavailable');
  const pin = chainId === 1 ? process.env.ETHEREUM_BLOCK : process.env.BASE_BLOCK;
  if (pin !== undefined) assert(BigInt(pin) <= BigInt(finalized.number), 'Requested block is not finalized');
  const head = pin === undefined ? finalized : await rpc('eth_getBlockByNumber', toHex(BigInt(pin)), false);
  assert(head?.hash, 'Requested block unavailable');
  const samples = [];
  for (let offset = 0; offset < 12 && samples.length < size; offset++) {
    const number = toHex(BigInt(head.number) - BigInt(offset));
    const block = await rpc('eth_getBlockByNumber', number, true);
    const candidates = block.transactions.filter(isPlain);
    if (!candidates.length) continue;
    let receipts;
    try {
      const blockReceipts = await rpc('eth_getBlockReceipts', number);
      receipts = new Map(blockReceipts.map(receipt => [receipt.transactionHash, receipt]));
    } catch {
      // Some public endpoints allow per-transaction receipts only.
    }
    const operatorFee = chainId === 8453 ? await oracleCall('getOperatorFee', [21000n], number) : 0n;
    for (let i = 0; i < candidates.length && samples.length < size; i += 8) {
      const batch = await Promise.all(candidates.slice(i, i + 8).map(async tx => {
        const receipt = receipts ? receipts.get(tx.hash) : await rpc('eth_getTransactionReceipt', tx.hash);
        if (receipt?.status !== '0x1' || BigInt(receipt.gasUsed) !== 21000n) return null;
        if (await rpc('eth_getCode', tx.to, number) !== '0x') return null;
        assert.equal(receipt.blockHash, block.hash);
        return { tx, receipt };
      }));
      for (const row of batch) {
        if (!row || samples.length === size) continue;
        const { tx, receipt } = row;
        if (chainId === 8453) assert(receipt.l1Fee !== undefined, 'Base receipt missing L1 fee');
        const l1Fee = BigInt(receipt.l1Fee ?? 0);
        samples.push({ tx, receipt, timestamp: block.timestamp, operatorFee,
          totalWei: executionFee(receipt) + l1Fee + operatorFee });
      }
    }
  }
  assert.equal(samples.length, size, `Not enough comparable samples on chain ${chainId}`);
  return { chainId, finalized: { number: head.number, hash: head.hash, timestamp: head.timestamp }, samples };
}

async function entrySamples(head) {
  assert.notEqual(await ethereum('eth_getCode', portal, head), '0x', 'Missing OptimismPortal code');
  const logs = await ethereum('eth_getLogs', {
    address: portal, topics: [depositTopic], fromBlock: toHex(BigInt(head) - 2500n), toBlock: head,
  });
  const receipts = [];
  for (const hash of [...new Set(logs.map(log => log.transactionHash))].reverse().slice(0, 32)) {
    const tx = await ethereum('eth_getTransactionByHash', hash);
    if (lower(tx.to) !== lower(portal) || BigInt(tx.value) <= 0n) continue;
    const receipt = await ethereum('eth_getTransactionReceipt', hash);
    receipts.push({ tx, receipt, feeWei: executionFee(receipt) });
    if (receipts.length === 3) break;
  }
  assert(receipts.length, 'No direct native portal deposit found in the search window');
  return receipts;
}

async function checkoutEstimate(rollup) {
  const { tx, receipt, totalWei: plainWei } = rollup.samples.find(row => row.tx.type === '0x2') ?? rollup.samples[0];
  const data = '0x112233445566778899aabbccddeeff11';
  const value = 10n ** 15n;
  // Override the sampled sender's balance for the read-only simulation. The
  // actual historical balance may have been spent by the sampled transfer.
  const estimatedGas = BigInt(await base('eth_estimateGas', {
    from: tx.from, to: tx.to, value: toHex(value), data,
  }, receipt.blockNumber, { [tx.from]: { balance: toHex(10n ** 18n) } }));
  const unsigned = serializeTransaction({
    chainId: 8453, type: 'eip1559', nonce: Number(BigInt(tx.nonce)), to: tx.to, value, data,
    gas: estimatedGas, maxFeePerGas: BigInt(tx.maxFeePerGas ?? tx.gasPrice),
    maxPriorityFeePerGas: BigInt(tx.maxPriorityFeePerGas ?? 0),
  });
  const [dataFeeBound, operatorFee] = await Promise.all([
    oracleCall('getL1FeeUpperBound', [BigInt((unsigned.length - 2) / 2)], receipt.blockNumber),
    oracleCall('getOperatorFee', [estimatedGas], receipt.blockNumber),
  ]);
  return { block: receipt.blockNumber, plainHash: tx.hash, plainWei, unsigned, estimatedGas, dataFeeBound, operatorFee,
    executionPrice: BigInt(receipt.effectiveGasPrice),
    totalWei: estimatedGas * BigInt(receipt.effectiveGasPrice) + dataFeeBound + operatorFee };
}

const [eth, rollup] = await Promise.all([sample(ethereum, 1), sample(base, 8453)]);
const extras = await Promise.allSettled([checkoutEstimate(rollup), entrySamples(eth.finalized.number)]);
const checkout = extras[0].status === 'fulfilled' ? extras[0].value : { unavailable: extras[0].reason.message };
const entries = extras[1].status === 'fulfilled' ? extras[1].value : { unavailable: extras[1].reason.message };
const ethMedian = median(eth.samples.map(row => row.totalWei));
const rollupMedian = median(rollup.samples.map(row => row.totalWei));
const reduction = Number((ethMedian - rollupMedian) * 10000n / ethMedian) / 100;
const budget = ethMedian / 10n;
const headroom = budget - rollupMedian;
const exitBudget = (visits, entry = 0n) => BigInt(visits) * headroom - entry;
const entryMedian = Array.isArray(entries) ? median(entries.map(row => row.feeWei)) : null;
const lines = [
  '# Read-only rollup payment fee screen', '',
  'Historic mainnet receipts for plain ETH wallet transfers. Samples are the first eight eligible transfers from each finalized head and preceding blocks. This is a small observation window.',
  'Base fees include execution and receipt L1 data fees plus the historical operator fee returned by the oracle. No transaction was broadcast for this screen.', '',
  '| Chain | Finalized head | Sample size | Median total fee (wei) |',
  '| --- | ---: | ---: | ---: |',
  `| Ethereum | ${BigInt(eth.finalized.number)} | ${size} | ${ethMedian} |`,
  `| Base | ${BigInt(rollup.finalized.number)} | ${size} | ${rollupMedian} |`, '',
  `Base direct transfer vs Ethereum direct transfer: **${reduction}% lower observed median fee**.`,
  `Same-chain Base plain-transfer baseline: **${rollupMedian} wei**. The 90% target would require **${rollupMedian / 10n} wei** per payment.`,
  checkout.unavailable ? `Base quote-linked checkout estimate unavailable: ${checkout.unavailable}.` :
    `Base quote-linked checkout estimate at block ${BigInt(checkout.block)}: **${checkout.totalWei} wei** (${checkout.estimatedGas} estimated gas, historical execution price, oracle data fee upper bound and operator fee). The sampled plain transfer used ${checkout.plainWei} wei. The checkout used a read-only balance override.`,
  checkout.unavailable ? '' : `Checkout estimate versus sampled Ethereum median: **${Number((ethMedian - checkout.totalWei) * 10000n / ethMedian) / 100}% lower**. The budget below uses plain Base transfers.`,
  entryMedian === null ? `Native bridge entry receipts unavailable: ${entries.unavailable}.` :
    `Observed Ethereum-side Base portal deposit fee: **${entryMedian} wei median** across ${entries.length} sampled native deposits. The deposits come from separate historical transactions.`, '',
  '| Purchases per user | Maximum combined entry/exit fees to keep 90% vs Ethereum (wei) | Exit budget after sampled entry fee (wei) |',
  '| ---: | ---: | ---: |',
  ...[1, 10, 100].map(visits => `| ${visits} | ${exitBudget(visits)} | ${entryMedian === null ? 'unmeasured' : exitBudget(visits, entryMedian)} |`),
  '', 'Budgets use the sampled direct fees. A negative exit budget means the entry sample alone exceeds the remaining allowance. Actual withdrawal and any sponsor or merchant operating costs are unmeasured. Balances on Base and Ethereum have different exit requirements.', '',
];
mkdirSync('bench', { recursive: true });
writeFileSync('bench/rollup-fees-results.json', JSON.stringify({ eth, rollup, checkout, entries },
  (_, value) => typeof value === 'bigint' ? value.toString() : value, 2));
writeFileSync('bench/rollup-fees-results.md', lines.join('\n'));
console.log(lines.join('\n'));
