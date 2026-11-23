import test from 'node:test';
import assert from 'node:assert/strict';
import { collectPinnedSnapshot } from './pinned-rpc-snapshot.mjs';

const recipient = '0x' + '11'.repeat(20);
const token = '0x' + '22'.repeat(20);
const blockHash = '0x' + 'ab'.repeat(32);
const block = { number: '0x5', hash: blockHash };
const params = { chainId: '1', blockNumber: '5', blockHash, entries: [{ recipient, asset: token }] };
const rpcWith = value => async (method, args) => {
  if (method === 'eth_chainId') return '0x1';
  if (method === 'eth_getBlockByNumber') return block;
  if (method === 'eth_call') {
    assert.equal(args[0].to, token);
    assert.equal(args[1].blockHash, blockHash);
    assert.equal(args[1].requireCanonical, true);
    return value;
  }
  throw Error('Unexpected RPC method: ' + method);
};

test('ERC20 balanceOf accepts ABI zero-padded 32-byte nonzero balance', async () => {
  const result = await collectPinnedSnapshot(rpcWith('0x' + '0'.repeat(63) + 'a'), params);
  assert.equal(result.balances[0].balanceWei, '10');
});

test('ERC20 balanceOf accepts ABI zero balance', async () => {
  const result = await collectPinnedSnapshot(rpcWith('0x' + '0'.repeat(64)), params);
  assert.equal(result.balances[0].balanceWei, '0');
});

test('ERC20 balanceOf rejects short and malformed ABI words', async () => {
  for (const value of ['0x0', '0x', '0x' + '0'.repeat(63), '0x' + 'z'.repeat(64)]) {
    await assert.rejects(collectPinnedSnapshot(rpcWith(value), params), /Invalid ERC20 balanceOf return/);
  }
});
