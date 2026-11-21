import test from 'node:test';
import assert from 'node:assert/strict';
import {checkReceiptConfirmations} from './receipt-confirmation.mjs';

const blockHash = '0x' + 'ab'.repeat(32);
const receipt = {status:'success', blockNumber:'5', blockHash};
const rpc = async (method) => {
  if (method === 'eth_chainId') return '0x7a69';
  if (method === 'eth_blockNumber') return '0x10';
  if (method === 'eth_getBlockByNumber') return {hash:blockHash, number:'0x5'};
  throw Error('Unexpected RPC method');
};
test('expected chain ID matches the local RPC', async () => {
  const result = await checkReceiptConfirmations(rpc, receipt, 12, '0x7a69');
  assert.equal(result.canonicalAtCheck, true);
  assert.equal(result.consensusAuthenticated, false);
  assert.equal(result.verifiedAllIn, false);
});
test('rejects wrong chain despite otherwise matching receipt block', async () => {
  await assert.rejects(checkReceiptConfirmations(rpc, receipt, 12, '0x1'), /chain ID mismatch/);
});
test('rejects malformed expected chain ID', async () => {
  await assert.rejects(checkReceiptConfirmations(rpc, receipt, 12, '31337'), /Expected chain ID/);
});
test('rejects malformed RPC chain ID', async () => {
  const bad = async method => method === 'eth_chainId' ? '31337' : rpc(method);
  await assert.rejects(checkReceiptConfirmations(bad, receipt, 12, '0x7a69'), /canonical RPC quantity/);
});
test('chain mismatch aborts before reading block or tip', async () => {
  const calls = [];
  const bad = async method => { calls.push(method); return method === 'eth_chainId' ? '0x1' : rpc(method); };
  await assert.rejects(checkReceiptConfirmations(bad, receipt, 12, '0x7a69'), /chain ID mismatch/);
  assert.deepEqual(calls, ['eth_chainId']);
});
