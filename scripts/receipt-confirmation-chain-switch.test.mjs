import test from 'node:test';
import assert from 'node:assert/strict';
import {checkReceiptConfirmations} from './receipt-confirmation.mjs';

const blockHash = '0x' + 'ab'.repeat(32);
const evidence = {status:'success', blockNumber:'5', blockHash};
const makeRpc = (chainResponses) => {
  let chainReads = 0;
  return async (method) => {
    if (method === 'eth_chainId') return chainResponses[Math.min(chainReads++, chainResponses.length - 1)];
    if (method === 'eth_blockNumber') return '0x10';
    if (method === 'eth_getBlockByNumber') return {hash:blockHash, number:'0x5'};
    throw Error('Unexpected method');
  };
};

test('rejects chain switch after otherwise valid canonical observations', async () => {
  await assert.rejects(
    checkReceiptConfirmations(makeRpc(['0x7a69', '0x1']), evidence, 12, '0x7a69'),
    /chain ID changed/
  );
});
test('accepts stable chain identity with explicit expected ID', async () => {
  const result = await checkReceiptConfirmations(makeRpc(['0x7a69', '0x7a69']), evidence, 12, '0x7a69');
  assert.equal(result.consensusAuthenticated, false);
  assert.equal(result.verifiedAllIn, false);
});
test('rejects malformed second chain identity', async () => {
  await assert.rejects(
    checkReceiptConfirmations(makeRpc(['0x7a69', '31337']), evidence, 12, '0x7a69'),
    /canonical RPC quantity/
  );
});
