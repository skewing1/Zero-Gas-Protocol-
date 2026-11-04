import { getAddress, isHex, recoverTypedDataAddress, type Address, type Hex, type PublicClient } from 'viem';
import { abi, intentHash, typedIntent, tokenAbi, zero, type ChainConfig, type Entry } from './protocol.js';
import { Ledger } from './ledger.js';

function uint(value: unknown, bits = 256) {
  if (typeof value !== 'string' || !/^(0|[1-9][0-9]{0,77})$/.test(value)) throw new Error('Expected decimal integer string');
  const result = BigInt(value);
  if (result >= 1n << BigInt(bits)) throw new Error('Integer exceeds field size');
  return result;
}

function hex(value: unknown, bytes: number): Hex {
  if (typeof value !== 'string' || !isHex(value, { strict: true }) || value.length !== 2 + bytes * 2) {
    throw new Error('Invalid hex field');
  }
  return value;
}

export class Pool {
  constructor(private readonly client: PublicClient, private readonly chain: ChainConfig,
    private readonly relayer: Address, private readonly ledger: Ledger) {}

  async nonce(entry: Entry) {
    return this.client.readContract({ abi, address: entry.account, functionName: 'nextNonce', args: [entry.intent.nonceKey] });
  }

  async delegated(entry: Entry) {
    const code = await this.client.getCode({ address: entry.account });
    return code?.toLowerCase() === `0xef0100${this.chain.protocolAccountImpl.slice(2).toLowerCase()}`;
  }

  async accept(body: unknown) {
    const input = body as { account: string; intent: Record<string, unknown>; sig: string };
    const account = getAddress(input.account);
    const raw = input.intent;
    const intent = {
      payee: getAddress(String(raw.payee)), asset: getAddress(String(raw.asset)), amount: uint(raw.amount),
      feeCap: uint(raw.feeCap), serviceId: hex(raw.serviceId, 32), manifestHash: hex(raw.manifestHash, 32),
      nonceKey: uint(raw.nonceKey, 192), nonceSeq: uint(raw.nonceSeq, 64), deadline: uint(raw.deadline, 64),
    };
    const sig = hex(input.sig, 65);
    const hash = intentHash(this.chain.chainId, account, intent);
    if (this.ledger.get(hash)) return { hash, duplicate: true };
    const entry = { account, intent, sig, hash };
    const block = await this.client.getBlock();
    if (block.timestamp > intent.deadline) throw new Error('Intent expired');
    if (!await this.delegated(entry)) throw new Error('Account is not delegated to this chain implementation');
    if (await this.nonce(entry) !== intent.nonceSeq) throw new Error('Unexpected nonce sequence');
    const signer = await recoverTypedDataAddress({ ...typedIntent(this.chain.chainId, account, intent), signature: sig });
    if (signer !== account) throw new Error('Bad signature');
    const balance = intent.asset === zero ? await this.client.getBalance({ address: account })
      : await this.client.readContract({ abi: tokenAbi, address: intent.asset, functionName: 'balanceOf', args: [account] });
    if (balance < intent.amount + intent.feeCap) throw new Error('Insufficient balance at selected fee');
    await this.client.simulateContract({
      abi, address: account, functionName: 'executeIntent', args: [intent, sig, intent.feeCap, this.relayer],
      account: this.chain.settler,
    });
    if (this.ledger.get(hash)) return { hash, duplicate: true };
    this.ledger.receive(entry);
    return { hash, duplicate: false };
  }
}
