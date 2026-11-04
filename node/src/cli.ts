import { createServer, type IncomingMessage } from 'node:http';
import { readFileSync } from 'node:fs';
import { createPublicClient, defineChain, getAddress, http, isHex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { json, type NodeConfig } from './protocol.js';
import { Ledger } from './ledger.js';
import { Pool } from './pool.js';
import { Batcher } from './batcher.js';
import { Submitter } from './submitter.js';
import { Watcher } from './watcher.js';

async function body(request: IncomingMessage) {
  let bytes = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes > 32_768) throw new Error('Request body too large');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

async function start(config: NodeConfig) {
  const url = process.env[config.chain.rpcEnv];
  const key = process.env.RELAYER_PRIVATE_KEY;
  if (!url || !key || !isHex(key)) throw new Error('Set the chain RPC environment variable and RELAYER_PRIVATE_KEY');
  if (config.chain.feeModel === 'arbitrum') throw new Error('Arbitrum fee estimation is unverified');
  for (const [name, value] of Object.entries({
    port: config.port, maxBatchSize: config.maxBatchSize, maxWaitMs: config.maxWaitMs,
    pollMs: config.pollMs, replaceAfterMs: config.replaceAfterMs,
  })) {
    if (!Number.isSafeInteger(value) || value < 1) throw new Error(`Invalid ${name}`);
  }
  if (!Number.isSafeInteger(config.chain.finalityDepthBlocks) || config.chain.finalityDepthBlocks < 0) {
    throw new Error('Invalid finality depth');
  }
  config.chain.settler = getAddress(config.chain.settler);
  config.chain.protocolAccountImpl = getAddress(config.chain.protocolAccountImpl);
  const chain = defineChain({ id: config.chain.chainId, name: config.chain.name,
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 }, rpcUrls: { default: { http: [url] } } });
  const client = createPublicClient({ chain, transport: http(url) });
  if (await client.getChainId() !== chain.id) throw new Error('RPC chain ID mismatch');
  for (const address of [config.chain.settler, config.chain.protocolAccountImpl]) {
    if (!await client.getCode({ address })) throw new Error(`No deployed code at ${address}`);
  }
  const account = privateKeyToAccount(key);
  const ledger = new Ledger(config.database);
  const pool = new Pool(client, config.chain, account.address, ledger);
  const batcher = new Batcher(client, config, account.address, ledger, pool);
  const submitter = new Submitter(client, account, chain, config, ledger, pool, batcher);
  const watcher = new Watcher(client, config, ledger, pool, account.address);
  let processing = false;
  const timer = setInterval(async () => {
    if (processing) return;
    processing = true;
    try {
      await watcher.tick();
      await submitter.tick();
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
    } finally {
      processing = false;
    }
  }, config.pollMs);
  const server = createServer(async (request, response) => {
    response.setHeader('content-type', 'application/json');
    try {
      if (request.method === 'POST' && request.url === '/intents') {
        const data = await body(request);
        const accepted = await pool.accept(data);
        response.end(json(accepted));
        if (!accepted.duplicate) {
          void Promise.allSettled(config.peers.map(peer => fetch(new URL('/intents', peer), {
            method: 'POST', body: json(data), headers: { 'content-type': 'application/json' },
            signal: AbortSignal.timeout(5000),
          })));
        }
        return;
      }
      if (request.method === 'GET' && request.url?.startsWith('/intents/')) {
        const hash = request.url.slice('/intents/'.length);
        const result = isHex(hash) && ledger.get(hash);
        response.statusCode = result ? 200 : 404;
        response.end(json(result || { error: 'Intent not found' }));
        return;
      }
      response.statusCode = 404;
      response.end(json({ error: 'Unknown route' }));
    } catch (error) {
      response.statusCode = 400;
      response.end(json({ error: error instanceof Error ? error.message : String(error) }));
    }
  });
  server.listen(config.port, config.host ?? '127.0.0.1');
  process.once('SIGTERM', () => {
    clearInterval(timer);
    server.close(() => process.exit(0));
  });
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  const configIndex = args.indexOf('--config');
  if (configIndex < 0 || !args[configIndex + 1]) throw new Error('Pass --config FILE');
  const config = JSON.parse(readFileSync(args[configIndex + 1], 'utf8')) as NodeConfig;
  args.splice(configIndex, 2);
  if (command === 'start') return start(config);
  if (command === 'ledger' && args[0] === '--summary') {
    const ledger = new Ledger(config.database);
    try { console.log(json(ledger.summary())); } finally { ledger.close(); }
    return;
  }
  if (command === 'submit-intent' || command === 'status') {
    const url = `http://${config.host ?? '127.0.0.1'}:${config.port}/intents`;
    const response = command === 'submit-intent'
      ? await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' },
        body: readFileSync(args[0] ?? '/dev/stdin', 'utf8') })
      : await fetch(`${url}/${args[0]}`);
    console.log(await response.text());
    if (!response.ok) process.exitCode = 1;
    return;
  }
  throw new Error('Use start, submit-intent [FILE], status HASH, or ledger --summary');
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
