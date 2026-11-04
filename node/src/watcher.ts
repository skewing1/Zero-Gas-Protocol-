import { decodeEventLog, getAbiItem, type Address, type Hex, type PublicClient } from 'viem';
import { abi, type NodeConfig } from './protocol.js';
import { Ledger, type Batch, type State } from './ledger.js';
import { Pool } from './pool.js';

export class Watcher {
  constructor(private readonly client: PublicClient, private readonly config: NodeConfig,
    private readonly ledger: Ledger, private readonly pool: Pool, private readonly relayer: Address) {}

  private async classify(batch: Batch, executed: Hex[]) {
    const block = await this.client.getBlock();
    const states: State[] = [];
    for (const hash of batch.hashes) {
      if (executed.includes(hash)) {
        states.push('final');
        continue;
      }
      const { entry } = this.ledger.get(hash)!;
      if (!await this.pool.delegated(entry)) {
        states.push('skipped');
        continue;
      }
      const nonce = await this.pool.nonce(entry);
      if (nonce > entry.intent.nonceSeq) {
        // A competing relayer or a different signed intent may have used this sequence.
        const logs = await this.client.getLogs({
          address: entry.account, event: getAbiItem({ abi, name: 'IntentExecuted' }), args: { intentHash: hash }, fromBlock: 0n, toBlock: 'latest',
        });
        const finalized = logs.some(log =>
          log.blockNumber !== null && block.number - log.blockNumber >= BigInt(this.config.chain.finalityDepthBlocks));
        states.push(finalized ? 'final' : logs.length ? 'validated' : 'skipped');
      } else {
        states.push(block.timestamp > entry.intent.deadline ? 'expired' : 'validated');
      }
    }
    return states;
  }

  async tick() {
    const batch = this.ledger.active();
    if (!batch) {
      for (const { entry } of this.ledger.queue()) {
        if (!await this.pool.delegated(entry) || await this.pool.nonce(entry) <= entry.intent.nonceSeq) continue;
        const [block, logs] = await Promise.all([
          this.client.getBlock(),
          this.client.getLogs({ address: entry.account, event: getAbiItem({ abi, name: 'IntentExecuted' }),
            args: { intentHash: entry.hash }, fromBlock: 0n, toBlock: 'latest' }),
        ]);
        if (!logs.length) this.ledger.state(entry.hash, 'skipped');
        else if (logs.some(log => log.blockNumber !== null &&
          block.number - log.blockNumber >= BigInt(this.config.chain.finalityDepthBlocks))) {
          this.ledger.state(entry.hash, 'final');
        }
      }
      return;
    }
    const existing = this.ledger.receipt(batch.id);
    if (existing) {
      const current = await this.client.getBlock({ blockNumber: BigInt(existing.blockNumber) }).catch(() => undefined);
      if (current?.hash !== existing.blockHash) {
        this.ledger.resolve(batch, 'orphaned', await this.classify(batch, []));
      } else if (await this.client.getBlockNumber({ cacheTime: 0 }) - current.number >=
        BigInt(this.config.chain.finalityDepthBlocks)) {
        this.ledger.resolve(batch, 'final', await this.classify(batch, existing.executions));
      }
      return;
    }

    for (const attempt of this.ledger.attempts(batch.id)) {
      const receipt = await this.client.getTransactionReceipt({ hash: attempt.hash }).catch(() => undefined);
      if (!receipt) continue;
      const executions: Hex[] = [];
      const fees: Record<string, bigint> = {};
      let skipped = 0;
      for (const log of receipt.logs) {
        try {
          const event = decodeEventLog({ abi, data: log.data, topics: log.topics });
          if (event.eventName === 'Skipped' && log.address.toLowerCase() === this.config.chain.settler.toLowerCase()) {
            ++skipped;
          } else if (event.eventName === 'IntentExecuted') {
            const { intentHash, asset, fee, relayer } = event.args;
            const entry = this.ledger.get(intentHash)?.entry;
            if (!entry || !batch.hashes.includes(intentHash) || log.address.toLowerCase() !== entry.account.toLowerCase() ||
              relayer.toLowerCase() !== this.relayer.toLowerCase()) continue;
            executions.push(intentHash);
            fees[asset] = (fees[asset] ?? 0n) + fee;
          }
        } catch {
          // Other contracts can emit unrelated logs in the same transaction.
        }
      }
      const raw = await this.client.request({ method: 'eth_getTransactionReceipt', params: [attempt.hash] }) as
        { l1Fee?: Hex } | null;
      const l1Fee = BigInt(raw?.l1Fee ?? 0);
      this.ledger.include(batch, {
        hash: attempt.hash, blockHash: receipt.blockHash, blockNumber: String(receipt.blockNumber),
        gasUsed: String(receipt.gasUsed), effectiveGasPrice: String(receipt.effectiveGasPrice),
        l1Fee: String(l1Fee), cost: String(receipt.gasUsed * receipt.effectiveGasPrice + l1Fee),
        fees: Object.fromEntries(Object.entries(fees).map(([asset, fee]) => [asset, String(fee)])),
        skipped, failed: receipt.status === 'reverted', executions,
      });
      break;
    }
  }
}
