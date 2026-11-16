// Offline outcome accounting. Snapshot authenticity must be independently RPC-attested.
const uint = (value, label) => {
  if (typeof value !== 'string' || !/^(0|[1-9][0-9]*)$/.test(value)) throw Error(`invalid ${label}`);
  const n = BigInt(value);
  if (n > (1n << 256n) - 1n) throw Error(`overflow ${label}`);
  return n;
};
const address = (s) => {
  if (typeof s !== 'string' || !/^0x[0-9a-fA-F]{40}$/.test(s)) throw Error('invalid address');
  return s.toLowerCase();
};

/** Offline principal reconciliation, not proof of RPC authenticity or cost savings. */
export function auditPrincipal({asset, obligations, balances, gasPayers = [], residuals = []}) {
  if (asset !== 'native' && asset !== 'token') throw Error('invalid asset');
  if (!Array.isArray(obligations) || obligations.length === 0) throw Error('empty obligations');
  if (!Array.isArray(balances) || !Array.isArray(gasPayers) || !Array.isArray(residuals)) throw Error('invalid arrays');
  const debit = new Map(), credit = new Map(), observed = new Map(), gas = new Map();
  for (const row of obligations) {
    const from = address(row.from), to = address(row.to), amount = uint(row.amount, 'amount');
    if (!amount || from === to) throw Error('invalid obligation');
    debit.set(from, (debit.get(from) ?? 0n) + amount);
    credit.set(to, (credit.get(to) ?? 0n) + amount);
  }
  for (const row of balances) {
    const account = address(row.account);
    if (observed.has(account)) throw Error('duplicate balance');
    observed.set(account, {before:uint(row.before,'before'), after:uint(row.after,'after')});
  }
  for (const row of gasPayers) {
    const account = address(row.account);
    if (gas.has(account)) throw Error('duplicate gas payer');
    gas.set(account, uint(row.feeWei,'feeWei'));
  }
  if (asset === 'token' && gas.size) throw Error('token audit requires gas costs tracked separately');
  const participants = new Set([...debit.keys(), ...credit.keys(), ...gas.keys()]);
  for (const account of participants) {
    const pair = observed.get(account);
    if (!pair) throw Error(`missing balance ${account}`);
    const expected = (credit.get(account) ?? 0n) - (debit.get(account) ?? 0n) - (asset === 'native' ? (gas.get(account) ?? 0n) : 0n);
    if (pair.after - pair.before !== expected) throw Error(`principal mismatch ${account}`);
  }
  for (const row of residuals) {
    const before = uint(row.before, 'residual before'), after = uint(row.after,'residual after');
    if (before !== after) throw Error('unsettled escrow/residual balance');
  }
  return {equivalent: true, asset, participantCount: participants.size, obligationCount: obligations.length, gasWei: [...gas.values()].reduce((a,b)=>a+b,0n).toString(), evidence: 'caller-supplied-unverified'};
}
