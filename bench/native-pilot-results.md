# Single-chain native payment pilot

Local Prague receipts from anvil/v1.3.1. 20 funded participants, up to three independent counterparties per payer.
Both baselines use direct EOA transfers from the same starting state. P0-net sends one transfer per payer/payee pair.
All paths finish with equivalent fee-adjusted wallet balances. The pilot checks each signed payment event and withdraws every remaining balance.
Pilot totals include deployment, deposits, signed batches and withdrawals. Calldata is included in execution gas.
The pilot verifies every signature on chain. SP1 proving, blob publication and cross-chain relays are unmeasured.
The 90–99% target for a validity-proven hub remains unmeasured.

| Payments/account | Payments | P0 gas | P0-net gas | Pilot gas | Savings vs P0 | Savings vs P0-net |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 20 | 420000 | 420000 | 3353290 | -698.40% | -698.40% |
| 10 | 200 | 4200000 | 1260000 | 6411680 | -52.66% | -408.86% |
| 100 | 2000 | 42000000 | 1260000 | 38702306 | 7.85% | -2971.61% |

| Payments/account | Deployment gas | Deposit gas | Settlement gas | Withdrawal gas | Pilot fee (wei) |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 973886 | 899060 | 871144 | 609200 | 6706580000000000 |
| 10 | 973886 | 899060 | 3929534 | 609200 | 12823360000000000 |
| 100 | 973886 | 899060 | 36220160 | 609200 | 77404612000000000 |

| Payments/account | Deposit + withdrawal gas | 90% P0-net gas budget | 99% P0-net gas budget |
| ---: | ---: | ---: | ---: |
| 1 | 1508260 | 42000 | 4200 |
| 10 | 1508260 | 126000 | 12600 |
| 100 | 1508260 | 126000 | 12600 |

The last table compares measured entry and exit costs with the full budget for each target. It assumes this pilot’s entry and exit design.

Negative savings mean the pilot costs more. P0 includes the effect of choosing a settlement window.
