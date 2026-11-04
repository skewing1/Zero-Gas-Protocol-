import { createHash, createPrivateKey } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { createIdentity, publishService, ServiceDirectory } from './records.mjs';

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function writeNewJson(path, value) {
  writeFileSync(path, JSON.stringify(value, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
}

function main([command, ...args]) {
  if (command === 'identity' && args.length === 1) {
    const { id, privateKey } = createIdentity();
    writeNewJson(args[0], { id, privateKey: privateKey.export({ type: 'pkcs8', format: 'pem' }) });
    console.log(id);
    return;
  }

  if (command === 'publish' && args.length === 6) {
    const [identityPath, output, service, revision, title, description] = args;
    const { id, privateKey } = readJson(identityPath);
    const record = publishService({ id, privateKey: createPrivateKey(privateKey) }, {
      service, revision: Number(revision), title, description,
    });
    if (!new ServiceDirectory().ingest(record)) throw new Error('Invalid listing or signing identity');
    writeNewJson(output, record);
    return;
  }

  if (command === 'digest' && args.length === 1) {
    const directory = new ServiceDirectory();
    if (!directory.ingest(readJson(args[0]))) throw new Error('Invalid signed listing');
    const [record] = directory.search();
    console.log('0x' + createHash('sha256').update(JSON.stringify(record)).digest('hex'));
    return;
  }

  if (command === 'discover' && args.length >= 2) {
    const [query, ...paths] = args;
    const directory = new ServiceDirectory();
    for (const path of paths) {
      if (!directory.ingest(readJson(path))) {
        console.error(`Skipped invalid or superseded record in ${path}`);
      }
    }
    console.log(JSON.stringify(directory.search(query), null, 2));
    return;
  }

  throw new Error('Usage: identity FILE | publish IDENTITY OUTPUT SERVICE REVISION TITLE DESCRIPTION | digest RECORD | discover QUERY RECORD...');
}

try {
  main(process.argv.slice(2));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
