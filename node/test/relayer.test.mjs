import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createPublicClient, createWalletClient, defineChain, getAbiItem, http } from 'viem';
import { mnemonicToAccount } from 'viem/accounts';
import { abi, intentHash, json, typedIntent, zero } from '../dist/protocol.js';
import { Ledger } from '../dist/ledger.js';

const url = process.env.ANVIL_RPC_URL ?? 'http://127.0.0.1:8545';
const mnemonic = 'test test test test test test test test test test test junk';
const chain = defineChain({ id: 31337, name: 'Anvil', nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: [url] } } });
const client = createPublicClient({ chain, transport: http(url), cacheTime: 0 });
const accounts = Array.from({ length: 5 }, (_, addressIndex) => mnemonicToAccount(mnemonic, { addressIndex }));
const [payer, firstRelayer, secondRelayer, , payee] = accounts;
const wallet = account => createWalletClient({ account, chain, transport: http(url) });
const amount = 123n;
const feeCap = 10n ** 15n;
const bytes32 = '0x' + '01'.repeat(32);
const cli = new URL('../dist/cli.js', import.meta.url);

async function waitFor(fn, label) {
  for (let attempt = 0; attempt < 250; ++attempt) {
    const value = await fn();
    if (value) return value;
    await new Promise(resolve => setTimeout(resolve, 40));
  }
  throw new Error(`Timed out waiting for ${label}`);
}

const mine = () => client.request({ method: 'evm_mine' });
const lookup = (port, hash) => fetch(`http://127.0.0.1:${port}/intents/${hash}`)
  .then(response => response.ok ? response.json() : null, () => null);
const post = (port, payload) => fetch(`http://127.0.0.1:${port}/intents`, {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: json(payload),
});

test('permissionless relayers recover races, reorgs and process restarts', { timeout: 85_000 }, async () => {
  const root = mkdtempSync(join(tmpdir(), 'zero-gas-relayer-'));
  const base = await client.request({ method: 'evm_snapshot' });
  const processes = new Map();
  let deployment;
  try {
    execFileSync('forge', ['script', 'script/Bench.s.sol:Bench', '--sig', 'run(bool,bool,bool,bool)',
      'false', 'false', 'false', 'true', '--rpc-url', url, '--broadcast', '--unlocked', '--sender', payer.address],
      { stdio: 'pipe' });
    const { transactions } = JSON.parse(readFileSync('broadcast/Bench.s.sol/31337/run-latest.json', 'utf8'));
    deployment = Object.fromEntries(transactions.map(tx => [tx.contractName, tx.contractAddress]));
    const authorization = await payer.signAuthorization({
      contractAddress: deployment.ProtocolAccount, chainId: 31337,
      nonce: await client.getTransactionCount({ address: payer.address }),
    });
    const delegation = await wallet(firstRelayer).sendTransaction({
      to: firstRelayer.address, authorizationList: [authorization],
    });
    assert.equal((await client.waitForTransactionReceipt({ hash: delegation })).status, 'success');

    const ports = [18551, 18552];
    function start(index, maxWaitMs = 400, peers = []) {
      const port = ports[index];
      const database = join(root, `relayer-${index}.sqlite`);
      const config = join(root, `relayer-${index}.json`);
      writeFileSync(config, json({
        chain: { chainId: 31337, name: 'Anvil', rpcEnv: 'ANVIL_RPC_URL', finalityDepthBlocks: 1,
          feeModel: 'l1', l1FeeOracle: null, forcedInclusion: false,
          settler: deployment.Settler, protocolAccountImpl: deployment.ProtocolAccount, trustNotes: 'Test' },
        database, port, peers, maxBatchSize: 10, maxWaitMs, pollMs: 40, replaceAfterMs: 4000,
      }));
      const account = [firstRelayer, secondRelayer][index];
      const child = spawn(process.execPath, [cli.pathname, 'start', '--config', config], {
        env: { ...process.env, ANVIL_RPC_URL: url, RELAYER_PRIVATE_KEY: account.getHdKey().privateKey
          ? '0x' + Buffer.from(account.getHdKey().privateKey).toString('hex') : '' },
        stdio: ['ignore', 'ignore', 'inherit'],
      });
      processes.set(index, child);
      return waitFor(() => fetch(`http://127.0.0.1:${port}/health`).then(() => true, () => false), 'HTTP listener');
    }
    async function stop(index) {
      const child = processes.get(index);
      if (!child) return;
      processes.delete(index);
      if (child.exitCode !== null || child.signalCode !== null) return;
      await new Promise(resolve => {
        child.once('exit', resolve);
        child.kill('SIGKILL');
      });
    }
    async function signed(lane, overrides = {}, signer = payer) {
      const intent = { payee: payee.address, asset: zero, amount, feeCap, serviceId: bytes32,
        manifestHash: bytes32, nonceKey: BigInt(lane), nonceSeq: 0n,
        deadline: (await client.getBlock()).timestamp + 3600n, ...overrides };
      const sig = await signer.signTypedData(typedIntent(31337, payer.address, intent));
      return { account: payer.address, intent, sig, hash: intentHash(31337, payer.address, intent) };
    }
    async function status(port, hash, expected) {
      return waitFor(async () => (await lookup(port, hash))?.state === expected, expected);
    }
    const event = getAbiItem({ abi, name: 'IntentExecuted' });
    const logs = hash => client.getLogs({ address: payer.address, event, args: { intentHash: hash }, fromBlock: 0n });
    await start(1, 400, [`http://127.0.0.1:${ports[0]}`]);
    await start(0, 400, [`http://127.0.0.1:${ports[1]}`]);

    for (const invalid of [
      await signed(1, {}, secondRelayer), await signed(1, { deadline: 1n }),
      await signed(1, { nonceSeq: 1n }), await signed(1, { amount: 10n ** 30n }),
    ]) assert.equal((await post(ports[0], invalid)).status, 400);

    const race = await signed(2);
    assert.equal((await post(ports[0], race)).status, 200);
    await waitFor(() => lookup(ports[1], race.hash), 'gossip');
    assert.equal((await (await post(ports[1], race)).json()).duplicate, true);
    await waitFor(async () => (await logs(race.hash)).length, 'race execution');
    await waitFor(async () => {
      await mine();
      return (await lookup(ports[0], race.hash))?.state === 'final' &&
        (await lookup(ports[1], race.hash))?.state === 'final';
    }, 'both relayers to observe finality');
    assert.equal((await logs(race.hash)).length, 1);
    await stop(1);

    const reorg = await signed(3);
    const fork = await client.request({ method: 'evm_snapshot' });
    await post(ports[0], reorg);
    await status(ports[0], reorg.hash, 'included');
    assert(await client.request({ method: 'evm_revert', params: [fork] }));
    await client.request({ method: 'evm_increaseTime', params: [60] });
    await mine();
    await waitFor(async () => (await logs(reorg.hash)).length, 'reorg resubmission');
    await status(ports[0], reorg.hash, 'included');
    await mine();
    await status(ports[0], reorg.hash, 'final');
    assert.equal((await logs(reorg.hash)).length, 1);

    const crash = await signed(4);
    await client.request({ method: 'evm_setAutomine', params: [false] });
    await post(ports[0], crash);
    await status(ports[0], crash.hash, 'submitted');
    await stop(0);
    await client.request({ method: 'evm_setAutomine', params: [true] });
    await start(0);
    await waitFor(async () => (await logs(crash.hash)).length, 'restart execution');
    await status(ports[0], crash.hash, 'included');
    await mine();
    await status(ports[0], crash.hash, 'final');
    assert.equal((await logs(crash.hash)).length, 1);
    await stop(0);

    let cost = 0n;
    let earned = 0n;
    for (const index of [0, 1]) {
      const ledger = new Ledger(join(root, `relayer-${index}.sqlite`));
      const summary = ledger.summary();
      const receiptRows = ledger.receiptRows();
      ledger.close();
      let receiptCost = 0n;
      for (const row of receiptRows) {
        const receipt = await client.getTransactionReceipt({ hash: row.hash });
        receiptCost += receipt.gasUsed * receipt.effectiveGasPrice;
        assert.equal(row.l1Fee, '0');
      }
      assert.equal(summary.costWei, receiptCost);
      cost += summary.costWei;
      earned += summary.earnedByAsset[zero] ?? 0n;
    }
    const events = await client.getLogs({ address: payer.address, event, fromBlock: 0n });
    assert.equal(earned, events.reduce((total, log) => total + log.args.fee, 0n));
    assert(cost > 0n);

    const offline = await signed(5);
    const hash = await wallet(payee).writeContract({
      address: payer.address, abi, functionName: 'executeIntent',
      args: [offline.intent, offline.sig, 0n, payee.address],
    });
    assert.equal((await client.waitForTransactionReceipt({ hash })).status, 'success');
    assert.equal((await logs(offline.hash)).length, 1);
  } finally {
    for (const child of processes.values()) child.kill('SIGKILL');
    await client.request({ method: 'evm_setAutomine', params: [true] });
    await client.request({ method: 'evm_revert', params: [base] });
    rmSync(root, { recursive: true, force: true });
  }
});
