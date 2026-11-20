#!/usr/bin/env node
// Offline-only, disposable Prague EVM execution. No external RPC or paid CI.
// Requires Foundry (anvil, forge, cast) and Node >= 20.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { connect } from 'node:net';
import { setTimeout as sleep } from 'node:timers/promises';

const HOST = '127.0.0.1';
const PORT = 8545;
const RPC = `http://${HOST}:${PORT}`;
const MNEMONIC = 'test test test test test test test test test test test junk';
const RUN_TIMEOUT = 240_000;

function requireBinary(name) {
  const result = spawnSync(name, ['--version'], { encoding: 'utf8', timeout: 8000 });
  assert(!result.error && result.status === 0,
    `${name} unavailable: install Foundry locally; no test was executed`);
}

async function portOccupied() {
  return new Promise(resolve => {
    const socket = connect({ host: HOST, port: PORT });
    socket.once('connect', () => { socket.destroy(); resolve(true); });
    socket.once('error', () => { socket.destroy(); resolve(false); });
    socket.setTimeout(1500, () => { socket.destroy(); resolve(true); });
  });
}

let id = 0;
async function rpc(method, params = []) {
  const response = await fetch(RPC, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params }),
    signal: AbortSignal.timeout(1500),
  });
  assert(response.ok, 'Local RPC HTTP error');
  const body = await response.json();
  assert(!body.error && body.id === id, 'Invalid local RPC reply');
  return body.result;
}

function execute(command, args) {
  const result = spawnSync(command, args, {
    stdio: 'inherit', timeout: RUN_TIMEOUT, env: {
      ...process.env,
      // Never accidentally inherit a remote RPC endpoint or wallet key.
      ETH_RPC_URL: RPC,
      FOUNDRY_ETH_RPC_URL: RPC,
      ETHERSCAN_API_KEY: '',
      PRIVATE_KEY: '',
    },
  });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, `${command} failed with exit code ${result.status}`);
}

async function main() {
  assert.equal(process.argv.length, 2, 'No arguments accepted');
  for (const name of ['anvil', 'forge', 'cast']) requireBinary(name);
  assert(!(await portOccupied()), 'Port 8545 already occupied; refusing to use an unknown RPC');
  const anvil = spawn('anvil', [
    '--host', HOST, '--port', String(PORT), '--chain-id', '31337',
    '--hardfork', 'prague', '--mnemonic', MNEMONIC,
  ], { stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  anvil.stdout.on('data', chunk => { output += chunk.toString(); output = output.slice(-4000); });
  anvil.stderr.on('data', chunk => { output += chunk.toString(); output = output.slice(-4000); });
  try {
    let ready = false;
    for (let attempt = 0; attempt < 60; ++attempt) {
      if (anvil.exitCode !== null) break;
      try {
        if (BigInt(await rpc('eth_chainId')) === 31337n) { ready = true; break; }
      } catch {}
      await sleep(250);
    }
    assert(ready, 'Prague Anvil did not start: ' + output);
    console.log('Disposable Prague Anvil running on loopback, chain 31337.');
    execute('forge', ['test', '-vv']);
    execute('node', ['scripts/bench.mjs']);
    console.log('Real locally mined receipt benchmark finished: bench/results.json');
    console.log('Do not interpret this as EIP-7702 or cross-chain savings: bench.mjs benchmarks P0/P1/P2 only.');
  } finally {
    anvil.kill('SIGTERM');
    await Promise.race([new Promise(resolve => anvil.once('exit', resolve)), sleep(2000)]);
    if (anvil.exitCode === null) anvil.kill('SIGKILL');
  }
}

main().catch(error => { console.error(error.stack ?? String(error)); process.exitCode = 1; });
