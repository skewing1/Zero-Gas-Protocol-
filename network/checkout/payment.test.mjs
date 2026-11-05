import assert from 'node:assert/strict';
import test from 'node:test';
import { approvePayment, paymentTransaction, parseTransferAmount } from './payment.mjs';

const quote = {
  chainId: 84532, payer: '0x0000000000000000000000000000000000000001',
  payee: '0x0000000000000000000000000000000000000002',
  value: '0x1', nonce: '0x0', id: '0x0123456789abcdef0123456789abcdef', canPay: true,
};

test('a connected Base Sepolia wallet sends only the quoted transaction', async () => {
  let sends = 0;
  const result = await approvePayment({
    async request({ method, params }) {
      if (method === 'eth_chainId') return '0x14a34';
      if (method === 'eth_accounts') return [quote.payer];
      if (method === 'eth_getTransactionCount') return quote.nonce;
      assert.equal(method, 'eth_sendTransaction');
      assert.deepEqual(params, [paymentTransaction(quote)]);
      sends++;
      return 'transaction hash';
    },
  }, quote);
  assert.equal(sends, 1);
  assert.equal(result, 'transaction hash');
});

test('an unknown testnet is added and selected before sending', async () => {
  const methods = [];
  let chain = '0x1';
  let added = false;
  await approvePayment({
    async request({ method, params }) {
      methods.push(method);
      if (method === 'eth_chainId') return chain;
      if (method === 'eth_accounts') return [quote.payer];
      if (method === 'eth_getTransactionCount') return quote.nonce;
      if (method === 'wallet_switchEthereumChain') {
        assert.equal(params[0].chainId, '0x14a34');
        if (!added) throw Object.assign(new Error('Unknown chain'), { code: 4902 });
        chain = '0x14a34';
      } else if (method === 'wallet_addEthereumChain') {
        assert.equal(params[0].chainId, '0x14a34');
        added = true;
      } else {
        assert.equal(method, 'eth_sendTransaction');
        assert.equal(chain, '0x14a34');
      }
    },
  }, quote);
  assert.deepEqual(methods.filter(method => !['eth_chainId', 'eth_accounts', 'eth_getTransactionCount'].includes(method)), [
    'wallet_switchEthereumChain', 'wallet_addEthereumChain',
    'wallet_switchEthereumChain', 'eth_sendTransaction',
  ]);
});

test('refusing a network switch or lacking funds prevents payment', async () => {
  const wallet = {
    async request({ method }) {
      if (method === 'eth_chainId') return '0x1';
      assert.equal(method, 'wallet_switchEthereumChain');
      throw Object.assign(new Error('Rejected'), { code: 4001 });
    },
  };
  await assert.rejects(approvePayment(wallet, quote), /Rejected/);
  await assert.rejects(approvePayment({ request: assert.fail }, { ...quote, canPay: false }), /Insufficient/);
  await assert.rejects(approvePayment({ request: assert.fail }, { ...quote, chainId: 8453 }), /Unsupported/);
});


test('ETH amounts preserve wei precision and reject ambiguous input', () => {
  assert.equal(parseTransferAmount('0.000000000000000001'), 1n);
  assert.equal(parseTransferAmount('1.234567890123456789'), 1234567890123456789n);
  for (const amount of ['0', '-1', '1e-3', '01', '.1', '1.', '0.0000000000000000001', '1,000', '', '9'.repeat(80)]) {
    assert.throws(() => parseTransferAmount(amount));
  }
});

test('a changed or disconnected wallet cannot send a reviewed transfer', async () => {
  for (const accounts of [[], [quote.payee]]) {
    await assert.rejects(approvePayment({ async request({ method }) {
      if (method === 'eth_chainId') return '0x14a34';
      if (method === 'eth_accounts') return accounts;
      assert.fail('Must not send from another account');
    } }, quote), /Wallet account changed/);
  }
});


test('direct transfer has empty calldata and a changed nonce prevents sending', async () => {
  assert.equal(paymentTransaction(quote).data, '0x');
  assert.equal(paymentTransaction(quote).chainId, '0x14a34');
  assert.equal(paymentTransaction(quote).nonce, quote.nonce);
  await assert.rejects(approvePayment({ async request({method}) {
    if (method === 'eth_chainId') return '0x14a34';
    if (method === 'eth_accounts') return [quote.payer];
    if (method === 'eth_getTransactionCount') return '0x1';
    assert.fail('Must not replace another transaction');
  } }, quote), /nonce changed/);
});
