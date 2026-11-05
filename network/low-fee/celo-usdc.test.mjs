import assert from 'node:assert/strict';
import test from 'node:test';
import { decodeFunctionData, encodeFunctionResult, parseAbi } from '../../node/node_modules/viem/_esm/index.js';
import { quoteUsdc, parseUsdc, feeToMicroUsdc, celoUsdc } from './celo-usdc.mjs';
const abi = parseAbi([
  'function adaptedToken() view returns (address)', 'function getAdaptedToken() view returns (address)',
  'function decimals() view returns (uint8)', 'function balanceOf(address) view returns (uint256)',
  'function getL1Fee(bytes) view returns (uint256)', 'function getOperatorFee(uint256) view returns (uint256)',
]);
const sender = '0x0000000000000000000000000000000000000001';
const recipient = '0x0000000000000000000000000000000000000002';
function fixture(overrides = {}, chainId = 11142220) {
  const config = celoUsdc[chainId];
  const methods = [];
  const rpc = async (method, ...params) => {
    methods.push(method);
    if (method === 'eth_chainId') return '0x' + BigInt(overrides.chainId ?? chainId).toString(16);
    if (method === 'eth_getBlockByNumber') return { number: '0x1', hash: '0x' + '1'.repeat(64), timestamp: '0x1' };
    if (method === 'eth_getCode') return overrides.code ?? '0x01';
    if (method === 'eth_getBalance') return '0x0';
    if (method === 'eth_getTransactionCount') return '0x0';
    if (['eth_gasPrice', 'eth_maxPriorityFeePerGas'].includes(method)) { assert.equal(params[0], config.adapter); return method === 'eth_gasPrice' ? '0x3b9aca00' : '0x1'; }
    if (method === 'eth_estimateGas') { assert.equal(params[0].feeCurrency, config.adapter); assert.equal(params[0].type, '0x7b'); assert.equal(params.length, 2); return '0x30d40'; }
    if (method === 'eth_call') {
      const { functionName } = decodeFunctionData({ abi, data: params[0].data });
      const result = { adaptedToken: overrides.token ?? config.token, getAdaptedToken: config.token, decimals: 6, balanceOf: overrides.balance ?? 10_000_000n, getL1Fee: overrides.dataFee ?? 0n, getOperatorFee: 0n }[functionName];
      return encodeFunctionResult({ abi, functionName, result });
    }
    assert.fail('Unexpected or mutating method: ' + method);
  };
  return { rpc, methods, args: { chainId, sender, recipient, amount: parseUsdc('1'), maxFee: parseUsdc('0.01') } };
}

test('USDC-only transactor gets a capped unsigned CIP-64 testnet transfer', async () => {
  const { rpc, methods, args } = fixture();
  const result = await quoteUsdc(rpc, args);
  assert.equal(result.senderNative, '0');
  assert.equal(result.unsignedTransaction.type, '0x7b');
  assert.equal(result.unsignedTransaction.feeCurrency, celoUsdc[args.chainId].adapter);
  assert.equal(result.unsignedTransaction.to, celoUsdc[args.chainId].token);
  assert(result.serializedUnsigned.startsWith('0x7b'));
  assert(BigInt(result.maxFeeReserveMicroUsdc) <= args.maxFee);
  assert.equal(methods.some(m => m.startsWith('eth_send') || m.startsWith('eth_sign')), false);
});

test('mainnet returns fee data only, with no signing or deployment artifact', async () => {
  const { rpc, args } = fixture({}, 42220);
  const result = await quoteUsdc(rpc, args);
  assert.equal(result.mode, 'read-only-mainnet-quote');
  assert.equal(result.unsignedTransaction, undefined);
  assert.equal(result.serializedUnsigned, undefined);
});

test('wrong chain, asset adapter, missing code, balances and fee-cap excess fail closed', async () => {
  for (const overrides of [{ chainId: 1 }, { token: sender }, { code: '0x' }, { balance: 1n }, { dataFee: 1n }]) {
    const { rpc, args } = fixture(overrides);
    await assert.rejects(quoteUsdc(rpc, args));
  }
  const { rpc, args } = fixture();
  await assert.rejects(quoteUsdc(rpc, { ...args, maxFee: 1n }), /fee reserve exceeds/);
});

test('USDC fees round upward from 18 to 6 decimals and amounts never use floats', () => {
  assert.equal(feeToMicroUsdc(1n), 1n);
  assert.equal(feeToMicroUsdc(10n ** 12n), 1n);
  assert.equal(feeToMicroUsdc(10n ** 12n + 1n), 2n);
  assert.equal(parseUsdc('1.000001'), 1000001n);
  for (const amount of ['1.0000001', '0', '-1', '1e-3', '01']) assert.throws(() => parseUsdc(amount));
});

test('read-only quote transport rejects signing and broadcasting before touching the network', async () => {
  const { readOnlyRpc } = await import('./rpc.mjs');
  const rpc = readOnlyRpc('http://127.0.0.1:1');
  for (const method of ['eth_sendTransaction', 'eth_sendRawTransaction', 'eth_sign', 'personal_sign', 'wallet_sendCalls']) {
    await assert.rejects(rpc(method), /Only read-only/);
  }
});
