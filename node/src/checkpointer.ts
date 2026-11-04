import { encodeAbiParameters, getAbiItem, keccak256, parseAbi, type Address, type Hex, type PublicClient } from 'viem';
import { abi } from './protocol.js';

const settlerAbi = parseAbi([
  'event Executed(address indexed account, bytes32 indexed intentHash, uint256 receiptIndex, bytes32 accumulator)',
  'function receiptAccumulator() view returns (bytes32)',
]);
const executedEvent = getAbiItem({ abi: settlerAbi, name: 'Executed' });
const paymentEvent = getAbiItem({ abi, name: 'IntentExecuted' });
const leafTypes = [
  { type: 'uint256' }, { type: 'address' }, { type: 'uint256' }, { type: 'address' }, { type: 'bytes32' },
  { type: 'address' }, { type: 'address' }, { type: 'uint256' }, { type: 'uint256' }, { type: 'uint256' },
] as const;
const accumulatorTypes = [
  { type: 'bytes32' }, { type: 'address' }, { type: 'bytes32' }, { type: 'uint256' },
] as const;

function pair(left: Hex, right: Hex) {
  const [first, second] = [left, right].sort();
  return keccak256(`${first}${second.slice(2)}`);
}

export function receiptTree(leaves: Hex[]) {
  if (!leaves.length) throw new Error('Cannot anchor an empty receipt range');
  const layers = [leaves.slice()];
  while (layers.at(-1)!.length > 1) {
    const nodes = layers.at(-1)!;
    const next: Hex[] = [];
    for (let index = 0; index < nodes.length; index += 2) {
      next.push(index + 1 < nodes.length ? pair(nodes[index], nodes[index + 1]) : nodes[index]);
    }
    layers.push(next);
  }
  return {
    root: layers.at(-1)![0],
    proof(index: number) {
      if (!Number.isSafeInteger(index) || index < 0 || index >= leaves.length) throw new Error('Invalid leaf index');
      const proof: Hex[] = [];
      for (const layer of layers.slice(0, -1)) {
        const sibling = layer[index % 2 ? index - 1 : index + 1];
        if (sibling) proof.push(sibling);
        index = Math.floor(index / 2);
      }
      return proof;
    },
  };
}

export async function rebuildCheckpoint(client: PublicClient, options: {
  sourceChainId: number; settler: Address; fromBlock: bigint; toBlock: bigint;
  nextIndex: bigint; previousAccumulator: Hex; finalityDepth: bigint;
}) {
  const { sourceChainId, settler, fromBlock, toBlock, nextIndex, previousAccumulator, finalityDepth } = options;
  if (await client.getChainId() !== sourceChainId) throw new Error('Source RPC chain mismatch');
  const head = await client.getBlockNumber({ cacheTime: 0 });
  if (fromBlock > toBlock || head - toBlock < finalityDepth) throw new Error('Range is not final');
  const block = await client.getBlock({ blockNumber: toBlock });
  const [executions, payments] = await Promise.all([
    client.getLogs({ address: settler, event: executedEvent, fromBlock, toBlock, strict: true }),
    client.getLogs({ event: paymentEvent, fromBlock, toBlock, strict: true }),
  ]);
  const paymentsByKey = new Map(payments.map(log => [
    `${log.transactionHash}:${log.address.toLowerCase()}:${log.args.intentHash}`, log,
  ]));
  const sorted = executions.filter(log => log.args.receiptIndex >= nextIndex)
    .sort((a, b) => a.args.receiptIndex < b.args.receiptIndex ? -1 : a.args.receiptIndex > b.args.receiptIndex ? 1 : 0);
  let accumulator = previousAccumulator;
  const receipts = sorted.map((log, index) => {
    const { receiptIndex, account, intentHash } = log.args;
    if (receiptIndex !== nextIndex + BigInt(index)) throw new Error('Receipt range is not contiguous');
    const payment = paymentsByKey.get(`${log.transactionHash}:${account.toLowerCase()}:${intentHash}`);
    if (!payment || payment.blockHash !== log.blockHash || payment.logIndex >= log.logIndex) {
      throw new Error('Missing matching payment event');
    }
    const { payee, asset, amount, fee } = payment.args;
    accumulator = keccak256(encodeAbiParameters(accumulatorTypes, [accumulator, account, intentHash, log.blockNumber]));
    if (accumulator !== log.args.accumulator) throw new Error('Receipt accumulator mismatch');
    const leaf = keccak256(keccak256(encodeAbiParameters(leafTypes, [
      BigInt(sourceChainId), settler, receiptIndex, account, intentHash, payee, asset, amount, fee, log.blockNumber,
    ])));
    return { receiptIndex, account, intentHash, leaf };
  });
  if (!receipts.length) return null;
  const historical = await client.readContract({
    address: settler, abi: settlerAbi, functionName: 'receiptAccumulator', blockNumber: toBlock,
  });
  const canonical = await client.getBlock({ blockNumber: toBlock });
  if (historical !== accumulator || canonical.hash !== block.hash) throw new Error('Source state changed or diverged');
  const tree = receiptTree(receipts.map(receipt => receipt.leaf));
  return {
    checkpoint: {
      sourceChainId: BigInt(sourceChainId), settler, fromReceiptIndex: nextIndex,
      toReceiptIndex: receipts.at(-1)!.receiptIndex, prevAccumulator: previousAccumulator,
      endAccumulator: accumulator, receiptsRoot: tree.root, sourceBlockNumber: toBlock, sourceBlockHash: block.hash,
    },
    receipts,
    proof: tree.proof,
  };
}
