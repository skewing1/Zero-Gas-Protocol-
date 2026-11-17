// EIP-7702 relayer admission preflight. This module NEVER verifies a signature,
// broadcasts a transaction, or authorizes payment. A cryptographic verifier must
// check the EIP-712 digest, signer, delegated code hash and chain state separately.
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const HASH = /^0x[0-9a-fA-F]{64}$/;
const UINT256 = (1n << 256n) - 1n;
const SUPPORTED = new Map([[1n, 'ethereum'], [8453n, 'base'], [42161n, 'arbitrum']]);

function uint(value, name) {
  if (typeof value !== 'string' || !/^(0|[1-9][0-9]*)$/.test(value)) {
    throw new Error(`${name}: canonical decimal string required`);
  }
  const n = BigInt(value);
  if (n > UINT256) throw new Error(`${name}: uint256 overflow`);
  return n;
}
function address(value, name) {
  if (typeof value !== 'string' || !ADDRESS.test(value) || /^0x0{40}$/i.test(value)) {
    throw new Error(`${name}: invalid address`);
  }
  return value.toLowerCase();
}
function hash(value, name) {
  if (typeof value !== 'string' || !HASH.test(value)) throw new Error(`${name}: invalid bytes32`);
  return value.toLowerCase();
}
export function preflightIntent(intent, context) {
  if (!intent || typeof intent !== 'object' || Array.isArray(intent)) throw new Error('intent required');
  if (!context || typeof context !== 'object' || Array.isArray(context)) throw new Error('context required');
  const required = ['chainId','account','settler','asset','recipient','amount','nonce','deadline','calldataHash','delegationCodeHash'];
  if (Object.keys(intent).sort().join(',') !== required.slice().sort().join(',')) {
    throw new Error('intent has missing or unknown fields');
  }
  const chainId = uint(intent.chainId, 'chainId');
  if (!SUPPORTED.has(chainId)) throw new Error('unsupported chain');
  if (chainId !== uint(context.chainId, 'context.chainId')) throw new Error('chain mismatch');
  const account = address(intent.account, 'account');
  const settler = address(intent.settler, 'settler');
  const recipient = address(intent.recipient, 'recipient');
  const asset = intent.asset === 'native' ? 'native' : address(intent.asset, 'asset');
  if (settler !== address(context.settler, 'context.settler')) throw new Error('settler mismatch');
  if (account !== address(context.account, 'context.account')) throw new Error('account mismatch');
  if (hash(intent.delegationCodeHash, 'delegationCodeHash') !== hash(context.delegationCodeHash, 'context.delegationCodeHash')) {
    throw new Error('delegation code mismatch');
  }
  if (hash(intent.calldataHash, 'calldataHash') !== hash(context.calldataHash, 'context.calldataHash')) {
    throw new Error('calldata mismatch');
  }
  const amount = uint(intent.amount, 'amount');
  if (amount === 0n) throw new Error('zero amount');
  const nonce = uint(intent.nonce, 'nonce');
  if (nonce !== uint(context.expectedNonce, 'context.expectedNonce')) throw new Error('nonce mismatch');
  const deadline = uint(intent.deadline, 'deadline');
  const now = uint(context.now, 'context.now');
  if (deadline <= now) throw new Error('intent expired');
  return Object.freeze({
    chainId: chainId.toString(), chain: SUPPORTED.get(chainId), account, settler,
    recipient, asset, amount: amount.toString(), nonce: nonce.toString(),
    deadline: deadline.toString(), calldataHash: intent.calldataHash.toLowerCase(),
    delegationCodeHash: intent.delegationCodeHash.toLowerCase(),
    signatureVerified: false, rpcVerified: false, safeToRelay: false
  });
}
