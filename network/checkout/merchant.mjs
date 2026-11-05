import { randomBytes } from 'node:crypto';
import { paymentTransaction } from './payment.mjs';

const address = /^0x[0-9a-f]{40}$/i;
const hash = /^0x[0-9a-f]{64}$/i;
const quantity = value => '0x' + value.toString(16);
const same = (left, right) => typeof left === 'string' && left.toLowerCase() === right.toLowerCase();

export function createMerchant(rpc, { payee: defaultPayee, amountWei: defaultAmount, chainId, estimateFees, actualOperatorFee }) {
  const quotes = new Map();
  const receiptQuotes = new Map();

  return {
    async quote(payer, { payee = defaultPayee, amountWei = defaultAmount } = {}) {
      if (!address.test(payee) || BigInt(payee) === 0n || typeof amountWei !== 'bigint' || amountWei <= 0n || amountWei >= 2n ** 256n) throw new Error('Invalid recipient or amount');
      if (!address.test(payer) || BigInt(payer) === 0n || same(payer, payee)) throw new Error('Invalid payer');
      const [network, block, code, price, balance, nonce] = await Promise.all([
        rpc('eth_chainId'), rpc('eth_getBlockByNumber', 'latest', false),
        rpc('eth_getCode', payee, 'latest'), rpc('eth_gasPrice'), rpc('eth_getBalance', payer, 'latest'), rpc('eth_getTransactionCount', payer, 'pending'),
      ]);
      if (BigInt(network) !== BigInt(chainId) || code !== '0x') throw new Error('Expected a wallet on the quoted network');
      const quote = {
        id: '0x' + randomBytes(16).toString('hex'), chainId, payer, payee, nonce,
        value: quantity(amountWei), issuedBlock: block.number, expiresAt: quantity(BigInt(block.timestamp) + 600n),
      };
      const tx = paymentTransaction(quote);
      // A simulation balance lets an unfunded transactor see the amount and fee.
      const overrides = { [payer]: { balance: quantity(amountWei + 10n ** 18n) } };
      const gas = BigInt(await rpc('eth_estimateGas', tx, block.number, overrides));
      const fees = estimateFees
        ? await estimateFees(rpc, tx, gas, BigInt(price), block.number, chainId)
        : { execution: gas * BigInt(price), data: 0n, operator: 0n };
      const total = fees.execution + fees.data + fees.operator;
      quote.estimatedFee = quantity(total);
      quote.fees = Object.fromEntries(Object.entries(fees).map(([key, value]) => [key, quantity(value)]));
      quote.canPay = BigInt(balance) >= amountWei + total;
      quotes.set(quote.id, Object.freeze(quote));
      return quote;
    },
    async verify(id, txHash) {
      const quote = quotes.get(id);
      if (!quote || !hash.test(txHash)) throw new Error('Unknown quote or invalid transaction hash');
      const [network, tx, receipt] = await Promise.all([
        rpc('eth_chainId'), rpc('eth_getTransactionByHash', txHash), rpc('eth_getTransactionReceipt', txHash),
      ]);
      if (BigInt(network) !== BigInt(chainId)) throw new Error('Unexpected network');
      if (!tx || !receipt) return { state: 'pending' };
      if (
        receipt.status !== '0x1' || !same(receipt.transactionHash, txHash) ||
        !same(tx.blockHash, receipt.blockHash) || !same(tx.from, quote.payer) ||
        !same(tx.to, quote.payee) || tx.input !== '0x' || BigInt(tx.nonce) !== BigInt(quote.nonce) || BigInt(tx.value) !== BigInt(quote.value)
      ) throw new Error('Transaction does not pay this quote');
      const block = await rpc('eth_getBlockByNumber', receipt.blockNumber, false);
      if (!block || !same(block.hash, receipt.blockHash)) return { state: 'pending' };
      if (BigInt(block.number) <= BigInt(quote.issuedBlock) || BigInt(block.timestamp) > BigInt(quote.expiresAt)) {
        throw new Error('Payment is outside the quote window');
      }
      const assigned = receiptQuotes.get(txHash.toLowerCase());
      if (assigned && assigned !== id) throw new Error('Transaction already assigned to another quote');
      receiptQuotes.set(txHash.toLowerCase(), id);
      const gas = BigInt(receipt.gasUsed);
      const execution = gas * BigInt(receipt.effectiveGasPrice);
      if (actualOperatorFee && receipt.l1Fee === undefined) {
        return { state: 'paid', quoteId: id, transactionHash: txHash };
      }
      // Verification can still complete if historical fee data is unavailable.
      let networkFee;
      try {
        const operator = actualOperatorFee ? await actualOperatorFee(rpc, gas, receipt.blockNumber) : 0n;
        networkFee = quantity(execution + BigInt(receipt.l1Fee ?? 0) + operator);
      } catch {
        networkFee = undefined;
      }
      return { state: 'paid', quoteId: id, transactionHash: txHash, networkFee };
    },
  };
}
