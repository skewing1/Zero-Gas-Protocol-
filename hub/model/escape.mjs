// Reference state machine. Authentication, Merkle commitments and proof verification
// are deliberately outside this model; these objects are NOT export proofs.
const copy = value => structuredClone(value);
const requireThat = (condition, message) => { if (!condition) throw new Error(message); };
export class Hub {
  constructor() { this.origins = new Map(); this.version = 0; }
  addOrigin(id) { requireThat(!this.origins.has(id), 'duplicate origin'); this.origins.set(id, { balances: new Map(), imports: new Set(), withdrawals: new Map(), frozen: false, forced: null }); }
  origin(id) { const state = this.origins.get(id); requireThat(state, 'unknown origin'); return state; }
  importDeposit(portal, index) {
    const s = this.origin(portal.id), d = portal.deposits[index];
    requireThat(!s.frozen && d && !s.imports.has(index), 'invalid import');
    requireThat(index === s.imports.size, 'out of order');
    s.imports.add(index); s.balances.set(d.owner, (s.balances.get(d.owner) ?? 0n) + d.amount); this.version++;
  }
  swap(a, alice, amountA, b, bob, amountB) {
    const x = this.origin(a), y = this.origin(b);
    requireThat(a !== b && !x.frozen && !y.frozen, 'frozen or identical origin');
    requireThat(amountA > 0n && amountB > 0n && (x.balances.get(alice) ?? 0n) >= amountA && (y.balances.get(bob) ?? 0n) >= amountB, 'balance');
    x.balances.set(alice, x.balances.get(alice) - amountA);
    x.balances.set(bob, (x.balances.get(bob) ?? 0n) + amountA);
    y.balances.set(bob, y.balances.get(bob) - amountB);
    y.balances.set(alice, (y.balances.get(alice) ?? 0n) + amountB); this.version++;
  }
  withdraw(id, owner, amount, withdrawalId) {
    const s = this.origin(id);
    requireThat(!s.frozen && amount > 0n && !s.withdrawals.has(withdrawalId) && (s.balances.get(owner) ?? 0n) >= amount, 'invalid withdrawal');
    s.balances.set(owner, s.balances.get(owner) - amount);
    s.withdrawals.set(withdrawalId, { owner, amount }); this.version++;
  }
  requestEscape(id, block, delay) {
    const s = this.origin(id);
    requireThat(Number.isSafeInteger(block) && block >= 0 && Number.isSafeInteger(delay) && delay > 0, 'invalid deadline');
    if (s.forced === null) s.forced = block + delay;
  }
  freeze(id, block) {
    const s = this.origin(id);
    requireThat(!s.frozen && s.forced !== null && block >= s.forced, 'escape not mature');
    s.frozen = true; this.version++;
    // In production this must be an Ethereum settlement-contract transition,
    // not an optional batch action that a missing prover can withhold.
    return this.export(id);
  }
  export(id) { return { id, version: this.version, state: copy(this.origin(id)) }; }
}
export class Portal {
  constructor(id) { this.id = id; this.holdings = 0n; this.deposits = []; this.root = null; this.exited = new Set(); this.claimed = new Set(); this.refunded = new Set(); }
  deposit(owner, amount) {
    requireThat(amount > 0n && !this.root?.state.frozen, 'deposit disabled');
    this.holdings += amount; this.deposits.push({ owner, amount }); return this.deposits.length - 1;
  }
  acceptVerifiedExport(root) {
    // CALLER MUST VERIFY canonical Ethereum finality, origin and frozen-state
    // commitment. This method models the boundary, not a cryptographic verifier.
    requireThat(root.id === this.id && (!this.root || root.version > this.root.version), 'stale/wrong origin');
    requireThat(!this.root?.state.frozen, 'terminal escape'); this.root = copy(root);
  }
  pay(amount) { requireThat(amount >= 0n && this.holdings >= amount, 'insolvent'); this.holdings -= amount; return amount; }
  exit(owner) {
    requireThat(this.root?.state.frozen && !this.exited.has(owner), 'no canonical freeze or duplicate exit');
    const amount = this.root.state.balances.get(owner) ?? 0n;
    requireThat(this.holdings >= amount, 'insolvent'); this.exited.add(owner); return this.pay(amount);
  }
  claim(id) {
    const w = this.root?.state.withdrawals.get(id);
    requireThat(w && !this.claimed.has(id) && this.holdings >= w.amount, 'invalid claim');
    this.claimed.add(id); return this.pay(w.amount);
  }
  refund(index) {
    requireThat(this.root?.state.frozen && !this.root.state.imports.has(index) && !this.refunded.has(index) && this.deposits[index], 'invalid refund');
    const amount = this.deposits[index].amount;
    requireThat(this.holdings >= amount, 'insolvent'); this.refunded.add(index); return this.pay(amount);
  }
}
