// Read-only EIP-1898 block-hash-pinned observations. Caller supplies a trusted RPC transport.
// RPC responses are not cryptographic proofs; canonicality/finality must be verified separately.
const quantity = (v, name) => {
  if (typeof v !== 'string' || !/^0x(?:0|[1-9a-fA-F][0-9a-fA-F]*)$/.test(v))
    throw Error('Invalid RPC quantity: ' + name);
  return BigInt(v);
};
const hex = (v, bytes, name) => {
  if (typeof v !== 'string' || !new RegExp('^0x[0-9a-fA-F]{' + bytes * 2 + '}$').test(v))
    throw Error('Invalid ' + name);
  return v.toLowerCase();
};
const addr = (v, name) => hex(v, 20, name);
const dec = (v, name) => {
  if (typeof v !== 'string' || !/^(0|[1-9][0-9]*)$/.test(v)) throw Error('Invalid ' + name);
  return BigInt(v);
};
const balanceOf = (recipient) => '0x70a08231' + recipient.slice(2).padStart(64, '0');
export async function collectPinnedSnapshot(rpc, { chainId, blockNumber, blockHash, entries }) {
  if (typeof rpc !== 'function') throw Error('Missing RPC transport');
  const expectedChain = dec(chainId, 'chainId');
  if (expectedChain === 0n) throw Error('Zero chainId');
  const number = dec(blockNumber, 'blockNumber');
  const hash = hex(blockHash, 32, 'blockHash');
  if (!Array.isArray(entries) || !entries.length) throw Error('Missing entries');
  const keys = new Set();
  const normalized = entries.map((entry) => {
    const recipient = addr(entry.recipient, 'recipient');
    const asset = entry.asset === 'native' ? 'native' : addr(entry.asset, 'asset');
    const key = recipient + ':' + asset;
    if (keys.has(key)) throw Error('Duplicate recipient/asset');
    keys.add(key);
    return { recipient, asset };
  });
  const rpcChain = quantity(await rpc('eth_chainId', []), 'chainId');
  if (rpcChain !== expectedChain) throw Error('RPC chain mismatch');
  const block = await rpc('eth_getBlockByNumber', ['0x' + number.toString(16), false]);
  if (!block || hex(block.hash, 32, 'block.hash') !== hash ||
      quantity(block.number, 'block.number') !== number) throw Error('Block identity mismatch');
  const selector = { blockHash: hash, requireCanonical: true };
  const balances = [];
  for (const { recipient, asset } of normalized) {
    const raw = asset === 'native'
      ? await rpc('eth_getBalance', [recipient, selector])
      : await rpc('eth_call', [{ to: asset, data: balanceOf(recipient) }, selector]);
    if (asset !== 'native' && (typeof raw !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(raw)))
      throw Error('Invalid ERC20 balanceOf return');
    // ABI uint256 balanceOf returns a fixed-width 32-byte word, normally zero-padded.
    // JSON-RPC quantities (eth_getBalance) are minimal-width instead.
    const balance = asset === 'native' ? quantity(raw, 'balance') : BigInt(raw);
    if (balance < 0n) throw Error('Negative balance');
    balances.push({ recipient, asset, balanceWei: balance.toString() });
  }
  // Reject chain changes or reorgs during reads. Does not establish finality.
  if (quantity(await rpc('eth_chainId', []), 'chainId') !== expectedChain)
    throw Error('RPC chain changed during snapshot');
  const afterBlock = await rpc('eth_getBlockByNumber', ['0x' + number.toString(16), false]);
  if (!afterBlock || hex(afterBlock.hash, 32, 'block.hash') !== hash ||
      quantity(afterBlock.number, 'block.number') !== number) throw Error('Block changed during snapshot');
  return { chainId: expectedChain.toString(), blockNumber: number.toString(), blockHash: hash, balances };
}
