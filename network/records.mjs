import { createPublicKey, generateKeyPairSync, sign, verify } from 'node:crypto';

const recordDomain = 'sinister-rabbit/service/v1';

export function createIdentity() {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  return {
    id: publicKey.export({ type: 'spki', format: 'der' }).toString('base64url'),
    privateKey,
  };
}

function payload({ publisher, service, revision, title, description }) {
  return Buffer.from(JSON.stringify([recordDomain, publisher, service, revision, title, description]));
}

export function publishService(identity, { service, revision, title, description }) {
  const record = { publisher: identity.id, service, revision, title, description };
  const signature = sign(null, payload(record), identity.privateKey).toString('base64url');
  return { ...record, signature };
}

function validateRecord(record) {
  if (!record || typeof record !== 'object') return false;
  const { publisher, service, revision, title, description, signature } = record;
  if (typeof publisher !== 'string' || publisher.length !== 59 ||
      typeof signature !== 'string' || signature.length !== 86 ||
      typeof service !== 'string' || !/^[a-z0-9-]{1,64}$/.test(service) ||
      !Number.isSafeInteger(revision) || revision < 1 ||
      typeof title !== 'string' || !title.trim() || title.length > 120 ||
      typeof description !== 'string' || description.length > 4000) return false;
  try {
    const key = createPublicKey({ key: Buffer.from(publisher, 'base64url'), type: 'spki', format: 'der' });
    const canonicalId = key.export({ type: 'spki', format: 'der' }).toString('base64url');
    const proof = Buffer.from(signature, 'base64url');
    return key.asymmetricKeyType === 'ed25519' && canonicalId === publisher &&
      proof.toString('base64url') === signature && verify(null, payload(record), key, proof);
  } catch {
    return false;
  }
}

export class ServiceDirectory {
  #records = new Map();

  ingest(record) {
    if (!validateRecord(record)) return false;
    const { publisher, service, revision, title, description, signature } = record;
    const key = `${publisher}/${service}`;
    const previous = this.#records.get(key);
    if (previous && previous.revision >= revision) return false;
    this.#records.set(key, Object.freeze({ publisher, service, revision, title, description, signature }));
    return true;
  }

  search(query = '') {
    const needle = query.trim().toLowerCase();
    return [...this.#records.values()].filter(record =>
      `${record.title} ${record.description}`.toLowerCase().includes(needle));
  }
}
