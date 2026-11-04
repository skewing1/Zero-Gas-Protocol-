# Hub authentication kernel — build record

This is a component, not an end-to-end hub or a gas benchmark.

## Implemented

Rust EIP-712 hashing and secp256k1 recovery; uint256 balances, amounts, fees and
nonces; distinct origin asset IDs; atomic amount+fee accounting; replay, deadline,
domain and frozen-asset checks. Signature malleability is rejected (low-s only).
The signed transfer fee is exact, not an unsigned operator-supplied amount.

The SP1 guest calls the same kernel. Its state, time and fee-recipient inputs are
not yet authenticated against canonical state. Therefore its output MUST NOT be
accepted by a settlement or portal contract. No contracts consume this program.
It uses ordinary k256; SP1 accelerated signature patches remain unintegrated.

Seven native Rust tests pass. One digest vector was independently generated with
viem 2.38.6 and matched Rust. This is not the complete differential-vector suite.
The guest compiles to the SP1 RISC-V ELF. Compilation is not SP1 execution or
proving. No Groth16 proof or proving time has been measured.

## Pinned tools and verified download provenance

| Component | Pin | Release date | Source |
|---|---|---|---|
| Host Rust | 1.88.0 | 2025-06-26 | rustup toolchain metadata |
| SP1 CLI / guest | 5.2.4 | 2025-12-15 | https://github.com/succinctlabs/sp1/releases/tag/v5.2.4 |
| SP1 Rust | succinct-1.91.1 | 2025-11-14 | https://github.com/succinctlabs/rust/releases/tag/succinct-1.91.1 |

The Linux x86_64 release asset SHA-256 values were checked against GitHub release
metadata and are enforced by scripts/hub/install-sp1.sh. The CLI's standard
installer failed with UnknownIssuer here. Downloading the same pinned toolchain
using curl with normal TLS verification succeeded; certificate validation was
not disabled. All Rust dependencies are resolved in hub/Cargo.lock; direct crypto
and serialization versions are exact in the manifests.

sp1-contracts and Helios are not installed or verified. Do not infer a compatible
on-chain verifier, security review or production readiness from the compiler pin.

## Reproduction

On Linux x86_64 with rustup installed:

```sh
rustup toolchain install 1.88.0 --profile minimal
cargo +1.88.0 test --locked --manifest-path hub/Cargo.toml -p hub-kernel
bash scripts/hub/install-sp1.sh
cd hub
PATH="$PWD/.tools/bin:$PATH" cargo prove build --locked -p hub-auth-program
```

Local resource check: x86_64; cgroup memory limit 8,589,934,592 bytes (8 GiB),
CPU quota 800000/100000 (8 CPUs), no detected NVIDIA device. SP1's official
project template states at least 16 GB RAM for Groth16/PLONK generation:
https://github.com/succinctlabs/sp1-project-template . No proof attempt was made
on an undersized machine, and no mock proof substitutes for a real measurement.

## Required next gates

Authenticate state with the specified tree, bind domain/time/fee recipient to
public settlement context, integrate deposit and exit accounting, and bind
replayable batch data to actual EIP-4844 blobs. Then run SP1 execution and real
Groth16 generation on sufficient hardware, deploy the matching verifier locally,
and collect complete deposit-to-withdrawal receipts. Until then all hub savings,
minimum batch sizes, break-even prices and proving costs remain NOT MEASURED.
