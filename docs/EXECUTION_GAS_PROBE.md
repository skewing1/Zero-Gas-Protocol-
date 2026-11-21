# Delegated batch execution gas probe (not a savings claim)

Run from a **trusted local checkout** with Foundry installed:

```sh
FOUNDRY_PROFILE=prague forge test --match-contract DelegatedBatchGasProbeTest -vvvv
```

The three tests perform **2, 8, and 16** equal-value native-ETH payouts and a matching relayer-fee payment in two alternative paths. Each verifies the recipient deltas, relayer compensation, payer debits and delegated nonce, then emits `ExecutionGasProbe` with `gasleft()` execution-only measurements. The candidate uses `vm.etch` to emulate EIP-7702 delegation; **it does not create a type-4 transaction**. The baseline models independent ordinary EOA payments within one test transaction and therefore **does not capture separate transaction intrinsic gas**. The baseline fee transfer is an outcome-matching synthetic transfer, not a claim that an ordinary transfer needs a relayer.

**Do not compute or advertise >45% savings from these events.** They exclude transaction intrinsic gas, authorization-list overhead, real relayer gas and operating costs, data availability/L1 posting, deployment amortization, settlement, and cross-chain finality. No gas price or USD fee is implied by a `gasleft()` delta. The baseline and candidate are *execution probes*, not economically equivalent real transaction receipts.

For an all-in result, run separate transactions on a disposable Prague-capable chain, persist actual canonical receipt transaction hashes (including type-4 authorization list), record pre/post balances for every recipient and payer, reconcile gasUsed × effectiveGasPrice and chain-specific L1/blob fees, and include the relayer's compensation and external operating expenses without double counting. Do not mix synthetic or RPC-only receipt fixtures with verified measurements. Run Ethereum/Base/Arbitrum separately with chain-specific fee accounting and label local forks/simulations as such. Never move live funds or call paid RPC/CI without explicit approval.

## Acceptance gates

1. All three probes pass in a real Foundry execution; capture command, Foundry/solc version, commit SHA, stdout and machine-readable results.
2. A genuine type-4 signed authorization transaction is mined on a disposable Prague chain and independently inspected.
3. Baseline and candidate have identical recipient deltas and fee-recipient outcomes, with no receipt reuse.
4. All-in costs (network execution + authorization + data + relayer + deployment amortization + settlement) are measured and separately attributed by chain.
5. Savings percentage is reported only for reproduced equivalent-outcome runs, with uncertainty and amortization assumptions explicit.
