import test from 'node:test';
import assert from 'node:assert/strict';
import { collectPinnedSnapshot } from './pinned-rpc-snapshot.mjs';
const H = '0x' + 'ab'.repeat(32);
const A = '0x' + '12'.repeat(20);
const T = '0x' + '34'.repeat(20);
const base = { chainId: '8453', blockNumber: '10', blockHash: H, entries: [{ recipient: A, asset: 'native' }, { recipient: A, asset: T }] };
function mock(overrides = {}) {
  const calls = [];
  const rpc = async (method, params) => {
    calls.push([method, params]);
    if (overrides[method]) return overrides[method](params, calls);
    if (method === 'eth_chainId') return '0x2105';
    if (method === 'eth_getBlockByNumber') return { number: '0xa', hash: H };
    if (method === 'eth_getBalance') return '0x2a';
    if (method === 'eth_call') return '0x' + '0'.repeat(63) + '7';
    throw Error(method);
  };
  return { rpc, calls };
}
test('collects exact pinned native and ERC20 balances', async () => {
  const { rpc, calls } = mock();
  const s = await collectPinnedSnapshot(rpc, base);
  assert.deepEqual(s.balances.map(x => x.balanceWei), ['42', '7']);
  for (const [method, params] of calls.filter(([m]) => m === 'eth_getBalance' || m === 'eth_call')) {
    assert.deepEqual(params[1], { blockHash: H, requireCanonical: true });
    if (method === 'eth_call') assert.equal(params[0].data, '0x70a08231' + A.slice(2).padStart(64, '0'));
  }
});
test('rejects chain mismatch', async () => {
  await assert.rejects(collectPinnedSnapshot(mock({ eth_chainId: () => '0x1' }).rpc, base), /chain mismatch/);
});
test('rejects block hash mismatch', async () => {
  await assert.rejects(collectPinnedSnapshot(mock({ eth_getBlockByNumber: () => ({number:'0xa',hash:'0x'+'cd'.repeat(32)}) }).rpc, base), /Block identity mismatch/);
});
test('rejects changed chain after balances', async () => {
  let n = 0;
  await assert.rejects(collectPinnedSnapshot(mock({ eth_chainId: () => ++n === 1 ? '0x2105' : '0x1' }).rpc, base), /chain changed/);
});
test('rejects malformed ERC20 return', async () => {
  await assert.rejects(collectPinnedSnapshot(mock({ eth_call: () => '0x01' }).rpc, base), /ERC20 balanceOf/);
});
test('rejects duplicate entries and malformed hash before RPC', async () => {
  const {rpc,calls} = mock();
  await assert.rejects(collectPinnedSnapshot(rpc,{...base,entries:[base.entries[0],base.entries[0]]}),/Duplicate/);
  await assert.rejects(collectPinnedSnapshot(rpc,{...base,blockHash:'0x1234'}),/blockHash/);
  assert.equal(calls.length,0);
});
