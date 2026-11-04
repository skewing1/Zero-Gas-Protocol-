import { encodeAbiParameters, getAddress, keccak256, toHex, type Address, type Hex } from 'viem';

export const epochTypes = { Epoch: [
  { name: 'asset', type: 'address' }, { name: 'recipientsHash', type: 'bytes32' },
  { name: 'paymentsHash', type: 'bytes32' }, { name: 'feeCap', type: 'uint256' },
  { name: 'nonceKey', type: 'uint192' }, { name: 'nonceSeq', type: 'uint64' }, { name: 'deadline', type: 'uint64' },
] } as const;

/** Produce the complete public payment data a payer must approve before signing. */
export function encodePayments(payments: { to: Address; amount: bigint }[]) {
  if (!payments.length) throw new Error('Empty payment epoch');
  const recipients: Address[] = [];
  const indices = new Map<Address, number>();
  const totals = new Map<Address, bigint>();
  const records: string[] = [];
  for (const payment of payments) {
    const address = getAddress(payment.to);
    if (address === '0x0000000000000000000000000000000000000000' ||
      payment.amount <= 0n || payment.amount >= 1n << 64n) throw new Error('Invalid compact payment');
    let index = indices.get(address);
    if (index === undefined) {
      index = recipients.length;
      if (index >= 256) throw new Error('Recipient table exceeds 256 entries');
      recipients.push(address);
      indices.set(address, index);
    }
    totals.set(address, (totals.get(address) ?? 0n) + payment.amount);
    records.push(toHex(index, { size: 1 }).slice(2) + toHex(payment.amount, { size: 8 }).slice(2));
  }
  // KMP prefix function finds the shortest exact period in linear time.
  const prefix = new Uint32Array(records.length);
  for (let i = 1; i < records.length; ++i) {
    let matched = prefix[i - 1];
    while (matched && records[i] !== records[matched]) matched = prefix[matched - 1];
    if (records[i] === records[matched]) ++matched;
    prefix[i] = matched;
  }
  const candidate = records.length - prefix[records.length - 1];
  const patternLength = records.length % candidate === 0 ? candidate : records.length;
  const repetitions = records.length / patternLength;
  if (patternLength > 65535 || repetitions > 0xffffffff) throw new Error('Epoch exceeds encoding bounds');
  const data = (toHex(repetitions, { size: 4 }) + toHex(patternLength, { size: 2 }).slice(2)
    + records.slice(0, patternLength).join('')) as Hex;
  return {
    recipients, data, totals, patternLength, repetitions, paymentCount: records.length,
    recipientsHash: keccak256(encodeAbiParameters([{ type: 'address[]' }], [recipients])),
    paymentsHash: keccak256(data),
  };
}

export function epochDomain(chainId: number, account: Address) {
  if (!Number.isSafeInteger(chainId) || chainId <= 0) throw new Error('Explicit nonzero chain ID required');
  return { name: 'ProtocolEpochAccount', version: '2', chainId, verifyingContract: account } as const;
}
