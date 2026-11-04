# Compact-epoch target decision

90% across all measured controls: **FAIL**.
Full-platform 90–99% target: **NOT ESTABLISHED**. This experiment measures payments only.
Gas savings include protocol deployment, delegation and shared token setup. Actual local fee savings include all receipt fees; local fee prices are not mainnet projections.
All rows compare final wallet balances. Windowed settlement changes intermediate spendability and event granularity.

| Workload | Asset | All-in gas saving | Actual local fee saving | 90% gas | 99% gas |
| --- | --- | ---: | ---: | --- | --- |
| fresh-unique | native | -169.44% | -168.56% | FAIL | FAIL |
| fresh-unique | token | 5.11% | 5.45% | FAIL | FAIL |
| fresh-distinct-payers | native | -388.55% | -340.53% | FAIL | FAIL |
| fresh-distinct-payers | token | -80.25% | -68.46% | FAIL | FAIL |
| one-payer-1000 | native | 88.67% | 88.75% | FAIL | FAIL |
| one-payer-1000 | token | 92.32% | 92.38% | PASS | FAIL |
| one-payer-10000 | native | 98.87% | 98.88% | PASS | FAIL |
| one-payer-10000 | token | 99.22% | 99.23% | PASS | PASS |
| hundred-payers-10000 | native | 93.99% | 94.47% | PASS | FAIL |
| hundred-payers-10000 | token | 94.87% | 95.16% | PASS | FAIL |
| one-payer-10000-irregular | native | 97.67% | 97.68% | PASS | FAIL |
| one-payer-10000-irregular | token | 98.49% | 98.49% | PASS | FAIL |

The fresh-recipient and independent-payer controls prevent a concentrated-payment result from being labeled a universal gain.
Proof anchoring, service-manifest verification, real-network prices, off-chain operations and settlement-window latency remain outside this experiment. Include them before deciding platform viability.
