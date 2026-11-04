# Multi-chain hub: Phase 1 feasibility gate

Status: BLOCKED; not implemented or merged. This branch starts from
pr2-system-layer commit 07e4d7e9fe4887d02db9a553735383db8f30aa9a,
retaining ProtocolAccount and its tests. It does not adopt the ledger-v0 design.
The supplied later-phase descriptions are requirements, not evidence that those
phases have happened. No hub contracts, proof programs, audits or rc1 tag were
found in the repository when this branch was created.

## Direction

An Ethereum-settled validity hub is a materially different experiment from EOA
batching. It may amortize verification and data publication across payments, but
requires locked portal collateral, data availability and a sound escape protocol.
This changes the earlier funds-always-in-EOA architecture. An operator cannot
custody the assets, but contracts necessarily hold deposited collateral.
No saving is established until real proofs, entry, exit and all portal relays
are measured. Keep P0-net comparisons as well as P0; the same payer/payee window
must be available to both baseline and protocol.

## Original exit counterexample

Run `node --test hub/spec/exit-safety.test.mjs`.
These are arithmetic specification tests, not tests of implemented contracts.

1. A's last exported root assigns 100 A units to Alice. B assigns 100 B units to Bob.
2. A canonical hub transition atomically swaps these assets: Bob owns A and Alice owns B.
3. Export reaches B but not A. Both portals later time out independently.
4. Alice exits 100 A using A's stale state and 100 B using B's latest state.
5. Bob's canonical 100 A balance is no longer redeemable.

Every signature and state transition can be valid. Permanently freezing A stops
a second payout but does not make Bob whole. Allowing later roots can instead
create excess claims. The promise that every account exits exactly requires an
additional globally consistent settlement/escape protocol.

Candidate correction, NOT implemented: use per-origin finalized withdrawal
rights and a prepare/commit protocol that locks affected rights before a swap
becomes final. Define recovery for every partial acknowledgement and chain halt.
A simpler first experiment excludes cross-origin swaps and tests one origin;
that does not satisfy the requested multi-chain acceptance criteria. Do not
choose either design without specifying solvency and liveness at every state.
A multi-chain timeout by itself is not a consensus mechanism.

## Other prerequisites

- Evidence freshness: depth-N headers and MPT inclusion prove statements relative
  to a header. They do not authenticate an arbitrary supplied header as canonical.
  Local simulation needs explicit trusted checkpoints. Production needs the
  specified light client and authenticated finality state.
- Forced queues: require authenticated queue head, cursor and evidence freshness.
  Supplying an old evidence block must not hide mature forced entries. A recent
  root arrival cannot substitute for queue progress.
- SMT addressing: depth 32 cannot injectively index 160-bit addresses. Specify an
  authenticated collision-resolution/address-index registry; never truncate an
  address and overwrite a leaf. Asset subtrees and their encodings also need specs.
- Blob binding: EIP-4844 point evaluation authenticates a polynomial opening, not
  arbitrary Rust input. The circuit must bind its exact replayable batch encoding
  to the transaction's blob commitments. Validate blobhash linkage, field bounds,
  multi-blob ordering, canonical padding and adversarial mismatched inputs.
  No calldata fallback is accepted as evidence of blob-mode completion.
- Reconstruction: tables, account-index assignment, deposits, swaps, withdrawals,
  forced entries, fees and all state-changing outcomes must be reconstructible.
  Omitting signatures/nonces is acceptable only if deterministic replay remains
  possible from genesis and every accepted transition's public data.
- Precompile probes require known valid/invalid functional vectors. `eth_getCode`
  returning empty at a precompile does not mean it is unsupported.
- Committee caps bound issued asset units, not USD loss or LP losses automatically.
  Separate fake-credit exposure, legitimate depositor impairment and LP exposure.
- Upgrade semantics: arbitrary implementation/vkey replacement can authorize
  future balance theft. A timelock offers an exit opportunity; it does not mean
  the council can NEVER affect balances. Immutable enforcement boundaries would
  need to constrain every replacement program/implementation.

## Tooling and measurement status

Rust 1.88.0 and SP1 5.2.4 are now installed; the matching SP1 Rust toolchain
was downloaded and checksum-verified. The signed-transfer kernel passes native
Rust tests and its SP1 guest builds. See docs/hub-kernel.md for the reproducible
commands, resource limits, and exact scope. There is still no real Groth16 proof,
export proof, point-evaluation integration or four-chain payment run.
The mandatory blob/proof gate is NOT PASSED. No later phase or launch is ready.

## Corrected exit design

The canonical-origin escape reference model in `hub/model/escape.mjs` now
resolves the stale-snapshot counterexample under authenticated-export assumptions.
See `docs/hub-escape.md` for the chosen protocol, race ordering, refund/claim rules,
and explicit Ethereum-availability tradeoff. This is executable model progress,
not completion of the cryptographic or contract gates.

## Next implementation gate

Resolve and test the exit-state protocol first. Then bootstrap an exact pinned
SP1 toolchain and prove a minimal blob-bound state transition end-to-end, testing
that unrelated valid blob openings cannot authenticate different batch data.
Only after that gate passes build deposit evidence, full transitions and portals.
The real benchmark must count proving operational costs separately from network
fees, and specify the conversion of hardware/prover fees to ETH. Report both
hub-credit completion and origin-wallet completion; do not compare them as equal.

## Primary references

- EIP-4844: https://eips.ethereum.org/EIPS/eip-4844
- SP1 project template: https://github.com/succinctlabs/sp1-project-template

These references establish interfaces, not that this implementation is verified.
Comparisons with AggLayer, Elastic Network and Superchain remain unverified and
are deferred until the actual protocol and its trust model are specified.

## One-chain payment pilot

`NativePaymentPilot` implements ETH deposits, signed batches, balance reuse
between participants and direct withdrawals. It verifies each EIP-712 signature
on chain. The SP1 path remains separate and its proving cost is unmeasured.

Run the pilot using Foundry 1.3.1, Solidity 0.8.30, and Node 20.19.4.

```sh
forge install foundry-rs/forge-std@v1.9.7 --no-git
forge install OpenZeppelin/openzeppelin-contracts@v5.0.2 --no-git
npm --prefix node ci --ignore-scripts
forge test
node scripts/hub/bench-pilot.mjs
```

The script starts a local Prague Anvil and writes the gas report to
`bench/native-pilot-results.md` and every transaction and receipt to
`bench/native-pilot-results.json`. For each of 1, 10 and 100 payments per funded
account it compares the same window against P0 and P0-net. Twenty deterministic
local wallets each pay up to three distinct counterparties. The comparison
checks equivalent wallet principal after all funds leave the pilot.
