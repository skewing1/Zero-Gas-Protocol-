import Database from 'better-sqlite3';
import type { Hex } from 'viem';
import { json, type Entry } from './protocol.js';

export type State = 'received' | 'validated' | 'submitted' | 'included' | 'final' | 'skipped' | 'expired';
export type Batch = { id: number; nonce: number; hashes: Hex[]; state: 'submitted' | 'included' | 'final' | 'orphaned' };
export type Attempt = { hash: Hex; raw: Hex; sentAt: number; maxFee: string; tip: string; gas: string };
export type Receipt = {
  hash: Hex; blockHash: Hex; blockNumber: string; gasUsed: string; effectiveGasPrice: string;
  l1Fee: string; cost: string; fees: Record<string, string>; skipped: number; failed: boolean;
  executions: Hex[];
};
const numeric = new Set(['amount', 'feeCap', 'nonceKey', 'nonceSeq', 'deadline']);
const revive = (key: string, value: unknown) => numeric.has(key) ? BigInt(String(value)) : value;

export class Ledger {
  private readonly db: Database.Database;

  constructor(path: string) {
    this.db = new Database(path);
    this.db.pragma('journal_mode = WAL');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS intents (hash TEXT PRIMARY KEY, body TEXT NOT NULL, state TEXT NOT NULL, received INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS transitions (id INTEGER PRIMARY KEY, hash TEXT NOT NULL, state TEXT NOT NULL, at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS batches (id INTEGER PRIMARY KEY, nonce INTEGER NOT NULL, hashes TEXT NOT NULL, state TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS attempts (hash TEXT PRIMARY KEY, batch INTEGER NOT NULL, raw TEXT NOT NULL, sentAt INTEGER NOT NULL, maxFee TEXT NOT NULL, tip TEXT NOT NULL, gas TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS receipts (hash TEXT PRIMARY KEY, batch INTEGER NOT NULL, body TEXT NOT NULL);
    `);
  }

  get(hash: Hex) {
    const row = this.db.prepare('SELECT body,state,received FROM intents WHERE hash=?').get(hash) as
      { body: string; state: State; received: number } | undefined;
    return row && { entry: JSON.parse(row.body, revive) as Entry, state: row.state, received: row.received };
  }

  receive(entry: Entry) {
    this.db.transaction(() => {
      this.db.prepare('INSERT INTO intents VALUES (?,?,?,?)').run(entry.hash, json(entry), 'received', Date.now());
      this.state(entry.hash, 'received');
      this.state(entry.hash, 'validated');
    })();
  }

  state(hash: Hex, state: State) {
    this.db.prepare('UPDATE intents SET state=? WHERE hash=?').run(state, hash);
    this.db.prepare('INSERT INTO transitions(hash,state,at) VALUES (?,?,?)').run(hash, state, Date.now());
  }

  queue() {
    return (this.db.prepare("SELECT hash FROM intents WHERE state='validated' ORDER BY received, rowid").all() as { hash: Hex }[])
      .map(({ hash }) => this.get(hash)!);
  }

  active() {
    const row = this.db.prepare("SELECT * FROM batches WHERE state IN ('submitted','included') ORDER BY id LIMIT 1").get() as
      (Omit<Batch, 'hashes'> & { hashes: string }) | undefined;
    return row && { ...row, hashes: JSON.parse(row.hashes) as Hex[] };
  }

  attempts(batch: number) {
    return this.db.prepare('SELECT hash,raw,sentAt,maxFee,tip,gas FROM attempts WHERE batch=? ORDER BY rowid').all(batch) as Attempt[];
  }

  addAttempt(batch: number, attempt: Attempt) {
    const { hash, raw, sentAt, maxFee, tip, gas } = attempt;
    this.db.prepare('INSERT INTO attempts VALUES (?,?,?,?,?,?,?)').run(hash, batch, raw, sentAt, maxFee, tip, gas);
  }

  submit(nonce: number, entries: Entry[], attempt: Attempt) {
    this.db.transaction(() => {
      const hashes = entries.map(entry => entry.hash);
      const row = this.db.prepare('INSERT INTO batches(nonce,hashes,state) VALUES (?,?,?)')
        .run(nonce, json(hashes), 'submitted');
      this.addAttempt(Number(row.lastInsertRowid), attempt);
      for (const hash of hashes) this.state(hash, 'submitted');
    })();
  }

  receipt(batch: number) {
    const row = this.db.prepare('SELECT body FROM receipts WHERE batch=?').get(batch) as { body: string } | undefined;
    return row && JSON.parse(row.body) as Receipt;
  }

  include(batch: Batch, receipt: Receipt) {
    this.db.transaction(() => {
      this.db.prepare('INSERT INTO receipts VALUES (?,?,?)').run(receipt.hash, batch.id, json(receipt));
      this.db.prepare("UPDATE batches SET state='included' WHERE id=?").run(batch.id);
      for (const hash of batch.hashes) if (receipt.executions.includes(hash)) this.state(hash, 'included');
    })();
  }

  resolve(batch: Batch, state: 'final' | 'orphaned', states: State[]) {
    this.db.transaction(() => {
      this.db.prepare('UPDATE batches SET state=? WHERE id=?').run(state, batch.id);
      if (state === 'orphaned') this.db.prepare('DELETE FROM receipts WHERE batch=?').run(batch.id);
      batch.hashes.forEach((hash, index) => this.state(hash, states[index]));
    })();
  }

  summary() {
    const totals = { receipts: 0, costWei: 0n, failedCostWei: 0n, skipped: 0, earnedByAsset: {} as Record<string, bigint> };
    for (const { body } of this.db.prepare('SELECT body FROM receipts').all() as { body: string }[]) {
      const receipt = JSON.parse(body) as Receipt;
      ++totals.receipts;
      totals.costWei += BigInt(receipt.cost);
      if (receipt.failed) totals.failedCostWei += BigInt(receipt.cost);
      totals.skipped += receipt.skipped;
      for (const [asset, fee] of Object.entries(receipt.fees)) {
        totals.earnedByAsset[asset] = (totals.earnedByAsset[asset] ?? 0n) + BigInt(fee);
      }
    }
    return totals;
  }

  close() { this.db.close(); }
}
