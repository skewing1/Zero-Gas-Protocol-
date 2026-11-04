# Jointly authorized native clearing pilot

Local Prague receipts from anvil/v1.3.1. Each workload starts from a fresh snapshot.
Both baselines use direct EOA transfers from the same starting state. P0-net sends one transfer per payer/payee pair.
All paths finish with equivalent fee-adjusted wallet balances and withdraw every remaining balance.
Each participant signs the same window with a commitment to its payment list. Clients must retain and validate that list off chain. The contract checks consent and net balance conservation.
When every pair is unique, P0 and P0-net use the same measured receipt set.
Pilot totals include deployment, deposits, signed batches and withdrawals. Calldata is included in execution gas.
The pilot verifies submitted signatures on chain. SP1 proving, durable off-chain list publication and cross-chain relays are unmeasured.
The 90–99% target for a validity-proven hub remains unmeasured.

| Participants | Counterparties/account | Payments/account | Payments | P0 gas | P0-net gas | Pilot gas | Savings vs P0 | Savings vs P0-net |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 20 | 1 | 1 | 20 | 420000 | 420000 | 3562760 | -748.28% | -748.28% |
| 20 | 3 | 10 | 200 | 4200000 | 1260000 | 3561128 | 15.21% | -182.63% |
| 20 | 3 | 100 | 2000 | 42000000 | 1260000 | 3561188 | 91.52% | -182.63% |
| 101 | 100 | 100 | 10100 | 212100000 | 212100000 | 12577749 | 94.07% | 94.07% |

| Participants | Payments/account | Deployment gas | Deposit gas | Settlement gas | Withdrawal gas | Pilot fee (wei) |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 20 | 1 | 1300702 | 899060 | 753358 | 609640 | 7125520000000000 |
| 20 | 10 | 1300702 | 899060 | 751726 | 609640 | 7122256000000000 |
| 20 | 100 | 1300702 | 899060 | 751786 | 609640 | 7122376000000000 |
| 101 | 100 | 1300702 | 4540253 | 3658124 | 3078670 | 25155498000000000 |

| Participants | Payments/account | Deposit + withdrawal gas | 90% P0-net gas budget | 99% P0-net gas budget |
| ---: | ---: | ---: | ---: | ---: |
| 20 | 1 | 1508700 | 42000 | 4200 |
| 20 | 10 | 1508700 | 126000 | 12600 |
| 20 | 100 | 1508700 | 126000 | 12600 |
| 101 | 100 | 7618923 | 21210000 | 2121000 |

The last table compares measured entry and exit costs with the full budget for each target. It assumes this pilot’s entry and exit design.

Negative savings mean the pilot costs more. P0 includes the effect of choosing a settlement window.
