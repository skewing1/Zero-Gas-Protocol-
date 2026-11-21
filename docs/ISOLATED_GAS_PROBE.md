# Isolated execution probes: avoiding warm-state bias

The earlier `DelegatedBatchGasProbeTest` executes the baseline and candidate in **one test transaction**. The candidate therefore sees recipients already touched by baseline transfers, and balance assertions are cumulative. This creates EIP-2929 warm/cold-account asymmetry and makes a direct gas comparison misleading.

`IsolatedDelegatedBatchGasProbeTest` provides **six separate tests** (baseline and candidate for 2, 8, 16 recipients). Each runs in a separate Foundry test transaction with its own initial recipient balances and checks payer debits, relayer fee, and exact recipient outcomes. Run:

```sh
FOUNDRY_PROFILE=prague forge test --match-contract IsolatedDelegatedBatchGasProbeTest -vvvv
```

These remain **execution-only models**, not equivalent real transaction receipts. The baseline performs internal calls from a test contract rather than separate signed EOA transactions, and includes a synthetic relayer-fee transfer for outcome matching. Candidate uses `vm.etch` rather than a real EIP-7702 authorization transaction. Gasleft measurements exclude real intrinsic gas, type-4 authorization costs, L1 data fees, relay operations, and settlement. Test setup and calldata effects may also differ. Do not infer percent savings from these events.

For a verified all-in result, mine actual transactions on a disposable Prague EVM, verify canonical receipts and before/after recipient balances, and compare payer-inclusive costs with relayer fees and chain-specific posting fees, without double counting. Do not treat these modeled test events as evidence of >45% savings.
