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
  const encoded: string[] = [];
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
    encoded.push(toHex(index, { size: 1 }).slice(2), toHex(payment.amount, { size: 8 }).slice(2));
  }
  const data = ('0x' + encoded.join('')) as Hex;
  return {
    recipients, data, totals,
    recipientsHash: keccak256(encodeAbiParameters([{ type: 'address[]' }], [recipients])),
    paymentsHash: keccak256(data),
  };
}

export function epochDomain(chainId: number, account: Address) {
  if (!Number.isSafeInteger(chainId) || chainId <= 0) throw new Error('Explicit nonzero chain ID required');
  return { name: 'ProtocolEpochAccount', version: '1', chainId, verifyingContract: account } as const;
}
