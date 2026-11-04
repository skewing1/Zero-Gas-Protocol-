import { encodeFunctionData, serializeTransaction, type Address, type PublicClient } from 'viem';
import { abi, batchArgs, oracleAbi, zero, type Entry, type NodeConfig } from './protocol.js';
import { Ledger } from './ledger.js';
import { Pool } from './pool.js';

export class Batcher {
  constructor(private readonly client: PublicClient, private readonly config: NodeConfig,
    private readonly relayer: Address, private readonly ledger: Ledger, private readonly pool: Pool) {}

  async select(price: bigint, nonce: number) {
    const queue = this.ledger.queue();
    if (!queue.length || (queue.length < this.config.maxBatchSize &&
      Date.now() - queue[0].received < this.config.maxWaitMs)) return [];
    const block = await this.client.getBlock();
    const selected: Entry[] = [];
    const lanes = new Set<string>();
    let previousCost = 0n;
    for (const { entry } of queue) {
      if (block.timestamp > entry.intent.deadline) {
        this.ledger.state(entry.hash, 'expired');
        continue;
      }
      if (!await this.pool.delegated(entry)) continue;
      const onchain = await this.pool.nonce(entry);
      const lane = `${entry.account}:${entry.intent.nonceKey}`;
      if (onchain !== entry.intent.nonceSeq || lanes.has(lane)) continue;
      const rate = entry.intent.asset === zero ? 1n
        : BigInt(this.config.assetWeiPerUnit?.[entry.intent.asset.toLowerCase()] ?? '0');
      if (rate === 0n) continue;
      const candidate = [...selected, entry];
      const data = encodeFunctionData({ abi, functionName: 'settleBatch', args: batchArgs(candidate) });
      // An unsuccessful individual call can be swallowed by Settler, so require its own simulation.
      const valid = await this.client.call({
        to: entry.account, account: this.config.chain.settler,
        data: encodeFunctionData({ abi, functionName: 'executeIntent',
          args: [entry.intent, entry.sig, entry.intent.feeCap, this.relayer] }),
      }).then(() => true, () => false);
      if (!valid) continue;
      const gas = await this.client.estimateGas({ account: this.relayer, to: this.config.chain.settler, data });
      let cost = gas * price;
      if (this.config.chain.feeModel === 'opstack') {
        const oracle = this.config.chain.l1FeeOracle;
        if (!oracle) throw new Error('OP Stack configuration requires a fee oracle');
        const serialized = serializeTransaction({ type: 'eip1559', chainId: this.config.chain.chainId,
          to: this.config.chain.settler, nonce, data, gas, maxFeePerGas: price, maxPriorityFeePerGas: price });
        cost += await this.client.readContract({ address: oracle, abi: oracleAbi, functionName: 'getL1Fee', args: [serialized] });
      }
      if (entry.intent.feeCap * rate < cost - previousCost) continue;
      selected.push(entry);
      lanes.add(lane);
      previousCost = cost;
      if (selected.length === this.config.maxBatchSize) break;
    }
    return selected;
  }
}
