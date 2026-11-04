import assert from 'node:assert/strict';
import test from 'node:test';
import { createIdentity, publishService, ServiceDirectory } from './records.mjs';

test('a user can discover a service from a portable signed record', () => {
  const publisher = createIdentity();
  const reader = createIdentity();
  const origin = new ServiceDirectory();
  const replica = new ServiceDirectory();
  const record = publishService(publisher, {
    service: 'design', revision: 1, title: 'Design help', description: 'Interface review',
  });
  assert.notEqual(reader.id, publisher.id);
  assert.equal(origin.ingest(record), true);
  assert.equal(replica.ingest(JSON.parse(JSON.stringify(origin.search()[0]))), true);
  assert.deepEqual(replica.search('interface'), [record]);
});

test('the directory rejects tampering and stale revisions', () => {
  const publisher = createIdentity();
  const attacker = createIdentity();
  const directory = new ServiceDirectory();
  const listing = { service: 'design', title: 'Design help', description: 'Interface review' };
  const first = publishService(publisher, { ...listing, revision: 1 });
  const latest = publishService(publisher, { ...listing, revision: 2 });
  assert.equal(directory.ingest({ ...first, title: 'Fake' }), false);
  assert.equal(directory.ingest({ ...first, publisher: attacker.id }), false);
  assert.equal(directory.ingest(latest), true);
  assert.equal(directory.ingest(first), false);
  assert.deepEqual(directory.search(), [latest]);
});
