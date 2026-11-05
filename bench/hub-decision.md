# Hub decision — not measured

No Phase 1 hub implementation or real-proof run exists in this branch.
The executable specification counterexample is documented in docs/hub.md.

| Chain | 90% vs local P0 | 99% vs local P0 | vs Ethereum P0 | Minimum N | Break-even ratio |
|---|---|---|---|---|---|
| E (31337) | NOT MEASURED | NOT MEASURED | NOT MEASURED | Unknown | Unknown |
| A (31338) | NOT MEASURED | NOT MEASURED | NOT MEASURED | Unknown | Unknown |
| B (31339) | NOT MEASURED | NOT MEASURED | NOT MEASURED | Unknown | Unknown |
| C (31340) | NOT MEASURED | NOT MEASURED | NOT MEASURED | Unknown | Unknown |

All four requested workloads, all batch sizes and K values remain unmeasured.
There are no receipt or proof fixtures represented as measured results.
Proving times: unavailable. Chain C loss bound: not established; caps are not
configured and the corrected exit model is not yet contract/proof verified.
Phase 1 gate: BLOCKED. Phase 2/3/4 prerequisites: NOT SATISFIED.

## Component progress (not a savings result)

The root-bound batch kernel now passes 19 native Rust tests and independent
viem root/ABI vectors. The compiled SP1 guest passed one valid and three invalid
RISC-V execution cases, with public bytes matching the native kernel. Evidence:
`bench/hub-execution-results.json` and `docs/hub-kernel.md`.

No cryptographic proof, on-chain hub settlement, authenticated deposit/exit path
or blob-bound data publication has been measured. All decision entries above
remain NOT MEASURED. Execution wall time and RISC-V cycles are not proving cost
or EVM gas savings.
