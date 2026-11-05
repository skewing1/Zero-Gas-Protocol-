# Hub batch kernel — implementation and build record

This is a component, not an end-to-end hub or a gas-savings benchmark.

## Implemented

The Rust kernel checks EIP-712 hashes and secp256k1 signatures, uint256 balances,
exact signed fees, nonces, deadlines, domain separation and frozen assets. Asset
IDs remain distinct by origin. Signature malleability is rejected (low-s only).

The new batch transition checks the complete supplied state against a declared
old root, processes signed transfers atomically and commits a new root. It makes
one private state copy per batch rather than one full copy per transfer. Any
invalid transfer discards the whole batch's changes; individual `State::apply`
keeps its existing atomic semantics.

Accounts are committed in a depth-32 keccak sparse tree. The path is the first
32 bits of keccak(0x10 || address). A leaf is a sorted collision bucket containing
the complete hashed keys and account commitments. Two addresses with the same
path cannot overwrite each other. Each account commitment contains its address,
nonce and sorted nonzero per-asset balances. Zero entries normalize to absence.
Frozen-asset IDs are committed separately into the final state root.

This implementation requires the complete state as witness and recomputes both
roots. It is not a scalable sparse multiproof implementation. It uses ordinary
k256; SP1-accelerated signature patches remain unintegrated. Neither a depth-32
account path nor compilation is used to imply cheap proving.

## Public values and required settlement checks

The guest emits 320 bytes, ABI encoded as:

```solidity
(uint32 version, bytes32 oldRoot, bytes32 newRoot, uint256 chainId,
 address hub, address feeRecipient, uint64 batchTime, uint64 minDeadline,
 bytes32 receiptsRoot, uint32 transferCount)
```

Receipts bind the declared root, chain/domain, fee recipient, batch time, transfer
order and signed transfer digest. The public values are deterministic for the
same input. Batch size is capped at 10,000 as a prototype resource limit.

**The declared root is not yet authenticated to an actual chain.** A future
settlement contract must compare oldRoot to its stored canonical root, require
the correct chainId and hub address, enforce version, require batchTime <= block.timestamp, and reject
submission after minDeadline. A first-prover fee market also needs to bind
feeRecipient to the submitting prover. It must also enforce the current canonical freeze
commitment, deposit/forced cursors and data availability. The program cannot
learn canonical chain time or state just because those values are witness inputs.
No contract currently consumes this ELF or these public values. Do not use it
to accept payments, release portal assets or claim production proof security.

## Verification completed

- 19 native Rust tests pass, including forged/incomplete state, invalid late
  transfers, replay/domain checks, root normalization, collision buckets,
  per-origin fee accounting, frozen assets and receipt order.
- An independent viem 2.38.6 implementation generates the old/new roots,
  receipts root, collision root and complete ABI output. Its vectors match Rust.
- The guest compiles to the SP1 RISC-V ELF.
- The real SP1 5.2.4 RISC-V executor accepts a two-transfer batch and emits exactly
  the native Rust public bytes. It rejects a false state witness, a malformed
  signature and an expired batch. This is execution, not a cryptographic proof.

The recorded run is in `bench/hub-execution-results.json`. Its wall time and peak
RSS cover one successful and three expected-failure fixtures, not a throughput
benchmark or proving time. RISC-V cycle counts are not Ethereum gas.

Groth16 proof generation, verifier deployment, all on-chain hub gas, blob DA and
full deposit-to-exit costs remain NOT MEASURED. No mock proof stands in for them.

## Pins and provenance

| Component | Pin | Source |
|---|---|---|
| Host Rust | 1.88.0 | rustup release metadata; released 2025-06-26 |
| SP1 CLI, guest, executor, stark | 5.2.4 | https://github.com/succinctlabs/sp1/releases/tag/v5.2.4 |
| SP1 Rust | succinct-1.91.1 | https://github.com/succinctlabs/rust/releases/tag/succinct-1.91.1 |
| Independent encoding | viem 2.38.6 | repository's locked Node dependency |

Release asset SHA-256 checks are enforced by `scripts/hub/install-sp1.sh`, using
normal TLS verification. Rust dependencies are locked in `hub/Cargo.lock`; direct
dependencies are exact. The runner uses SP1's official core executor in run_fast
mode, without proof generation or trace/proving-cost estimates. No network prover,
private key, signing service, chain transaction or public deployment is involved.

## Reproduce

```sh
rustup toolchain install 1.88.0 --profile minimal
cargo +1.88.0 test --locked --manifest-path hub/Cargo.toml -p hub-kernel
npm --prefix node ci
node scripts/hub/batch-vectors.mjs --check
bash scripts/hub/install-sp1.sh
(cd hub && PATH="$PWD/.tools/bin:$PATH" cargo prove build --locked -p hub-auth-program)
cargo +1.88.0 build --release --locked --manifest-path hub/Cargo.toml -p hub-execute
python3 scripts/hub/check-execution.py
```

Local hardware: x86_64, 8 GiB cgroup memory, 8-CPU quota, no detected NVIDIA
hardware. No Groth16 attempt was made. The official SP1 project template states
at least 16 GB RAM for Groth16/PLONK generation:
https://github.com/succinctlabs/sp1-project-template .

sp1-contracts and Helios are not installed or verified. Deposits, MPT/finality
evidence, forced requests, canonical freeze/exit contracts and blob binding remain
required. Real proofs on adequate hardware and complete multi-chain receipt
benchmarks are necessary before any 90%/99% hub decision can be made.
