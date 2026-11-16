// Lossless payer-scoped aggregation for benchmark obligations; not multilateral netting.
// Grouping never crosses payer, recipient, asset, or settlement window boundaries.
const MAX = (1n << 256n) - 1n;
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
function address(value, name) {
  if (typeof value !== 'string' || !ADDRESS.test(value)) throw new TypeError(`Invalid ${name}`);
  return value.toLowerCase();
}
function amount(value) {
  if (typeof value !== 'string' || !/^(0|[1-9][0-9]*)$/.test(value)) throw new TypeError('Amount must be canonical decimal string');
  const n = BigInt(value);
  if (n === 0n || n > MAX) throw new RangeError('Amount outside positive uint256 range');
  return n;
}
export function aggregateObligations(obligations) {
  if (!Array.isArray(obligations)) throw new TypeError('Expected obligations array');
  const groups = new Map();
  for (const item of obligations) {
    if (item === null || typeof item !== 'object' || Array.isArray(item)) throw new TypeError('Invalid obligation');
    const payer = address(item.payer, 'payer');
    const recipient = address(item.recipient, 'recipient');
    const asset = item.asset === 'native' ? 'native' : address(item.asset, 'asset');
    const window = item.window;
    if (typeof window !== 'string' || !/^[a-zA-Z0-9._:-]{1,80}$/.test(window)) throw new TypeError('Invalid settlement window');
    const n = amount(item.amount);
    const key = JSON.stringify([payer, recipient, asset, window]);
    const previous = groups.get(key);
    const total = (previous?.amount ?? 0n) + n;
    if (total > MAX) throw new RangeError('Aggregated amount exceeds uint256');
    groups.set(key, { payer, recipient, asset, window, amount: total });
  }
  return [...groups.values()].map(x => ({...x, amount: x.amount.toString()}))
    .sort((a,b) => JSON.stringify([a.payer,a.recipient,a.asset,a.window]).localeCompare(JSON.stringify([b.payer,b.recipient,b.asset,b.window])));
}
