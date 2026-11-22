// SPDX-License-Identifier: MIT
import test from 'node:test';
import assert from 'node:assert/strict';
import { localRpc, main } from './capture-local-receipt.mjs';

test('refuses public and authenticated RPC endpoints before network access', () => {
  for (const url of ['https://127.0.0.1:8545', 'http://example.com:8545', 'http://user:pass@localhost:8545',
    'http://localhost:8545/?token=secret', 'file:///tmp/rpc']) {
    assert.throws(() => localRpc(url), /local HTTP endpoint/);
  }
});
test('rejects invalid timeout', () => assert.throws(() => localRpc('http://localhost:8545', {timeoutMs:0}), /timeout/));
test('rejects unauthorized RPC methods without dispatching requests', async () => {
  await assert.rejects(localRpc('http://127.0.0.1:8545')('eth_sendRawTransaction', []), /not permitted/);
});
test('rejects invalid confirmation and chain parameters before RPC', async () => {
  const h = '0x' + 'a'.repeat(64);
  await assert.rejects(main([h, 'http://localhost:8545', '1', '0']), /confirmations/);
  await assert.rejects(main([h, 'http://localhost:8545', '0', '1']), /chain ID/);
});
