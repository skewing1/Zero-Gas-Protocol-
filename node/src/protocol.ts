import { parseAbi, hashTypedData, type Address, type Hex } from 'viem';

export const zero = '0x0000000000000000000000000000000000000000';
export const intentFields = [
  { name: 'payee', type: 'address' }, { name: 'asset', type: 'address' },
  { name: 'amount', type: 'uint256' }, { name: 'feeCap', type: 'uint256' },
  { name: 'serviceId', type: 'bytes32' }, { name: 'manifestHash', type: 'bytes32' },
  { name: 'nonceKey', type: 'uint192' }, { name: 'nonceSeq', type: 'uint64' },
  { name: 'deadline', type: 'uint64' },
] as const;
export const abi = parseAbi([
  'struct Intent { address payee; address asset; uint256 amount; uint256 feeCap; bytes32 serviceId; bytes32 manifestHash; uint192 nonceKey; uint64 nonceSeq; uint64 deadline; }',
  'function executeIntent(Intent intent, bytes signature, uint256 fee, address relayer)',
  'function nextNonce(uint192 key) view returns (uint64)',
  'function settleBatch(address[] accounts, Intent[] intents, bytes[] signatures, uint256[] fees)',
  'event IntentExecuted(bytes32 indexed intentHash, address indexed payee, address asset, uint256 amount, uint256 fee, address indexed relayer, bytes32 serviceId, bytes32 manifestHash)',
  'event Skipped(address indexed account, bytes32 indexed intentHash, bytes revertData)',
]);
export const tokenAbi = parseAbi(['function balanceOf(address owner) view returns (uint256)']);
export const oracleAbi = parseAbi(['function getL1Fee(bytes transaction) view returns (uint256)']);

export interface Intent {
  payee: Address; asset: Address; amount: bigint; feeCap: bigint;
  serviceId: Hex; manifestHash: Hex; nonceKey: bigint; nonceSeq: bigint; deadline: bigint;
}
export interface Entry { hash: Hex; account: Address; intent: Intent; sig: Hex; }
export type ChainConfig = {
  chainId: number; name: string; rpcEnv: string; finalityDepthBlocks: number;
  feeModel: 'l1' | 'opstack' | 'arbitrum'; l1FeeOracle: Address | null;
  forcedInclusion: boolean; settler: Address; protocolAccountImpl: Address; trustNotes: string;
};
export type NodeConfig = {
  chain: ChainConfig; database: string; host?: string; port: number; peers: string[];
  maxBatchSize: number; maxWaitMs: number; pollMs: number; replaceAfterMs: number;
  assetWeiPerUnit?: Record<string, string>;
};

export function typedIntent(chainId: number, account: Address, message: Intent) {
  return {
    domain: { name: 'ProtocolAccount', version: '1', chainId, verifyingContract: account },
    types: { Intent: intentFields }, primaryType: 'Intent', message,
  } as const;
}
export function intentHash(chainId: number, account: Address, intent: Intent) {
  return hashTypedData(typedIntent(chainId, account, intent));
}
export function json(value: unknown) {
  return JSON.stringify(value, (_, field) => typeof field === 'bigint' ? field.toString() : field);
}
export function batchArgs(entries: Entry[]) {
  return [
    entries.map(entry => entry.account), entries.map(entry => entry.intent),
    entries.map(entry => entry.sig), entries.map(entry => entry.intent.feeCap),
  ] as const;
}
