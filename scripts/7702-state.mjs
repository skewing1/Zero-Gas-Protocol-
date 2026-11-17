// Read-only EIP-7702 delegation state check. Never authorizes execution.
const HEX_ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const HEX_QUANTITY = /^0x(?:0|[1-9a-fA-F][0-9a-fA-F]*)$/;
const CHAINS = new Set([1n, 8453n, 42161n]);
function addr(value) {
  if (typeof value !== 'string' || !HEX_ADDRESS.test(value) || /^0x0{40}$/i.test(value)) throw Error('invalid address');
  return value.toLowerCase();
}
function qty(value) {
  if (typeof value !== 'string' || !HEX_QUANTITY.test(value)) throw Error('invalid RPC quantity');
  return BigInt(value);
}
export async function inspectDelegation(rpc, {chainId, account, delegate, expectedNonce, deadline}) {
  if (typeof rpc !== 'function') throw Error('RPC function required');
  if (typeof chainId !== 'string' || !/^(0|[1-9][0-9]*)$/.test(chainId)) throw Error('invalid chain ID');
  if (typeof expectedNonce !== 'string' || !/^(0|[1-9][0-9]*)$/.test(expectedNonce)) throw Error('invalid nonce');
  if (typeof deadline !== 'string' || !/^(0|[1-9][0-9]*)$/.test(deadline)) throw Error('invalid deadline');
  const chain = BigInt(chainId), accountAddress = addr(account), delegateAddress = addr(delegate);
  if (!CHAINS.has(chain)) throw Error('unsupported chain');
  const observedChain = qty(await rpc('eth_chainId', []));
  if (observedChain !== chain) throw Error('RPC chain mismatch');
  const block = await rpc('eth_getBlockByNumber', ['latest', false]);
  if (!block || typeof block.hash !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(block.hash)) throw Error('invalid latest block');
  const now = qty(block.timestamp);
  if (BigInt(deadline) <= now) throw Error('expired at latest block');
  const code = await rpc('eth_getCode', [accountAddress, block.number]);
  const expectedCode = '0xef0100' + delegateAddress.slice(2);
  if (typeof code !== 'string' || code.toLowerCase() !== expectedCode) throw Error('delegation designator mismatch');
  const nonce = qty(await rpc('eth_getTransactionCount', [accountAddress, block.number]));
  if (nonce !== BigInt(expectedNonce)) throw Error('account transaction nonce mismatch');
  return Object.freeze({chainId: chain.toString(), account: accountAddress, delegate: delegateAddress,
    blockHash: block.hash.toLowerCase(), blockNumber: block.number, observedNonce: nonce.toString(),
    delegationObserved: true, signatureVerified: false, intentNonceVerified: false, safeToRelay: false});
}
