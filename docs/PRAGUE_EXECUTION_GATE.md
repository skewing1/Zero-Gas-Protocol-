# Local Prague execution gate (no paid services)

This is an **execution checklist**, not a benchmark result. The repository's default Foundry profile remains Cancun; use `FOUNDRY_PROFILE=prague` for EIP-7702 testing. Solidity 0.8.30 is pinned for Prague code generation. Run only on a disposable local chain with test accounts.

## Prerequisites

Install Foundry with a locally available compiler 0.8.30. Confirm `forge --version`, `anvil --version`, and `FOUNDRY_PROFILE=prague forge config --json` report the intended compiler and EVM version. Do not use public RPC endpoints or funded keys.

## Execution

1. Run `FOUNDRY_PROFILE=prague forge test -vvv`. Record the exit code and exact git commit. A passing Solidity unit test is **not** a mined type-4 transaction.
2. Start `anvil --hardfork prague --chain-id 31337` in an isolated process; confirm `eth_chainId = 0x7a69`. Never expose the RPC beyond loopback.
3. Create a disposable EOA and deploy `DelegatedBatchAccount` to the local chain. Sign an EIP-7702 authorization designating that implementation and submit an actual **type-4** transaction with its authorization list. Separately sign the contract's EIP-712 batch intent for the delegated EOA; these are different signatures.
4. Confirm receipt status, transaction type, chain ID, canonical block, authorization-list effects, recipient balances, delegated EOA nonce, and relayer balance. Capture hashes and raw receipts; do not infer authorization from a receipt alone.
5. Execute a conventional transfer baseline and a delegated batch with **identical recipients, amounts, asset, and final balances** from independent funded starting states. Include deployment amortization, authorization overhead, relayer compensation, execution gas, data availability, and cross-chain settlement where applicable.
6. Calculate all-in USD cost using documented chain-specific fee inputs and a timestamped exchange-rate assumption. Never apply Ethereum mainnet prices to Base or Arbitrum receipts without chain-specific data-fee reconciliation. Run 1, 10, 100 and 1000 payment scenarios where supported and include failed/reverted attempts in total costs.

## Acceptance criteria

Report each measured receipt, baseline/candidate outcome reconciliation, sample size, environment versions, all fee components, and reproducible commands. Only claim >45% reduction when `(baseline_all_in - candidate_all_in) / baseline_all_in > 0.45` on reproduced, equivalent-outcome measurements. Relayer-paid gas is **not** eliminated gas; it is a cost shifted to the relayer. A local Anvil measurement does not establish mainnet savings or safe cross-chain settlement.

No deployment, fund movement, paid RPC, or CI is authorized by this checklist.
