# Universal Near-Zero Gas Protocol

Sinister Rabbit aims to minimize gas usage across EVM-compatible networks.

This repository starts with the v2 transfer batching benchmark and its reference workload tests. GitHub Actions compiles the Solidity sources, runs the EVM test suite, and uploads the gas report on pushes and pull requests.
## Prerequisites
Install Foundry v1.3.1 (`forge`) and Solidity compiler access. `forge-std` is required:

```sh
forge install foundry-rs/forge-std@v1.9.7 --no-git
forge build
forge test -vv --gas-report
```

The test deploys two instances of the same contract, executes 100 separate state-changing calls on one and one batched call on the other, verifies matching balances and event payloads, and prints actual EVM execution gas for each workload.

**Important limits:** This compares EVM execution gas for calls within a local test, not complete transaction gas including the intrinsic 21,000 gas per separate transaction, transaction calldata fees, L2 data fees, prover fees, bridging, or cross-chain settlement. The batch is a purpose-built contract method, not an optimization that can be applied transparently to arbitrary contracts. It is not equivalent to all ERC-20 semantics, and contract addresses in emitted logs differ. Test events compare topics and data, not emitting address. Run the full benchmark before making any savings claim. Production readiness is not implied.

## Next step
Measure actual transaction receipts on a local Anvil node and chain forks; compare effective fee plus L1 data fees, including account/contract deployment costs amortized over workload.

## Additional reproducible validation

```sh
node --test scripts/validate-workload.mjs
node scripts/check-environment.mjs
```

The JavaScript tests validate a deterministic **reference model**, not compiled Solidity bytecode. They test state equivalence for supported recipient lists and reject several invalid inputs. The reference model intentionally excludes sender self-transfers because the batch function rejects them, whereas the single-transfer function permits them; the two public methods therefore do **not** have identical semantics over all possible inputs. The Solidity test also excludes this case. Do not present these tests as bytecode execution or a verified gas reduction.

For a true on-chain comparison, include transaction intrinsic gas, calldata, contract deployment amortization, L2 data fees and the full set of externally observable effects. The Solidity test currently measures gas within a single test transaction and compares event topics/data but not emitting addresses. Production-ready protocol work remains separate.
