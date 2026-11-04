import { encodeFunctionData, keccak256, type Chain, type Hex, type LocalAccount, type PublicClient } from 'viem';
import { abi, batchArgs, type Entry, type NodeConfig } from './protocol.js';
import { Ledger, type Attempt } from './ledger.js';
import { Pool } from './pool.js';
import { Batcher } from './batcher.js';

export class Submitter {
  constructor(private readonly client: PublicClient, private readonly account: LocalAccount,
    private readonly chain: Chain, private readonly config: NodeConfig, private readonly ledger: Ledger,
    private readonly pool: Pool, private readonly batcher: Batcher) {}

  async tick() {
    const active = this.ledger.active();
    if (active?.state === 'included') return;
    const [block, tip] = await Promise.all([
      this.client.getBlock(), this.client.estimateMaxPriorityFeePerGas(),
    ]);
    const maxFee = (block.baseFeePerGas ?? 0n) * 2n + tip;
    if (active) {
      const attempts = this.ledger.attempts(active.id);
      const prior = attempts.at(-1)!;
      const pending: Entry[] = [];
      for (const hash of active.hashes) {
        const entry = this.ledger.get(hash)!.entry;
        if (block.timestamp <= entry.intent.deadline && await this.pool.delegated(entry) &&
          await this.pool.nonce(entry) === entry.intent.nonceSeq) pending.push(entry);
      }
      const stale = Date.now() - prior.sentAt >= this.config.replaceAfterMs;
      if (!stale) {
        const known = await this.client.getTransaction({ hash: prior.hash }).then(() => true, () => false);
        if (!known && pending.length === active.hashes.length) await this.broadcast(prior.raw);
        return;
      }
      const bumped = (current: bigint, old: string) => {
        const minimum = BigInt(old) * 1125n / 1000n + 1n;
        return current > minimum ? current : minimum;
      };
      const replacement = await this.sign(active.nonce, pending, bumped(maxFee, prior.maxFee), bumped(tip, prior.tip));
      this.ledger.addAttempt(active.id, replacement);
      await this.broadcast(replacement.raw);
      return;
    }
    const nonce = await this.client.getTransactionCount({ address: this.account.address, blockTag: 'pending' });
    const entries = await this.batcher.select(maxFee, nonce);
    if (!entries.length) return;
    const attempt = await this.sign(nonce, entries, maxFee, tip);
    // The signed bytes are durable before any broadcast. Recovery can send the same transaction hash.
    this.ledger.submit(nonce, entries, attempt);
    await this.broadcast(attempt.raw);
  }

  private async sign(nonce: number, entries: Entry[], maxFee: bigint, tip: bigint): Promise<Attempt> {
    const to = entries.length ? this.config.chain.settler : this.account.address;
    const data = entries.length ? encodeFunctionData({ abi, functionName: 'settleBatch', args: batchArgs(entries) }) : '0x';
    const estimate = await this.client.estimateGas({ account: this.account.address, to, data });
    const gas = estimate * 120n / 100n;
    const raw = await this.account.signTransaction({
      chainId: this.chain.id, type: 'eip1559', nonce, to, data, gas,
      maxFeePerGas: maxFee, maxPriorityFeePerGas: tip,
    });
    return { raw, hash: keccak256(raw), sentAt: Date.now(), maxFee: String(maxFee), tip: String(tip), gas: String(gas) };
  }

  private async broadcast(serializedTransaction: Hex) {
    try {
      await this.client.sendRawTransaction({ serializedTransaction });
    } catch (error) {
      if (!/already known|nonce too low|already imported/i.test(String(error))) throw error;
    }
  }
}
