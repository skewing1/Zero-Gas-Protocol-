# Compact-epoch target decision

90% across all measured controls: **FAIL**.
Full-platform 90–99% target: **NOT ESTABLISHED**. This experiment measures payments only.
Gas savings include protocol deployment, delegation and shared token setup. Actual local fee savings include all receipt fees; local fee prices are not mainnet projections.
All rows compare final wallet balances. Windowed settlement changes intermediate spendability and event granularity.

| Workload | Asset | All-in gas saving | Actual local fee saving | 90% gas | 99% gas |
| --- | --- | ---: | ---: | --- | --- |
| fresh-unique | native | -165.69% | -164.81% | FAIL | FAIL |
| fresh-unique | token | 6.63% | 6.96% | FAIL | FAIL |
| fresh-distinct-payers | native | -381.23% | -333.21% | FAIL | FAIL |
| fresh-distinct-payers | token | -78.40% | -66.61% | FAIL | FAIL |
| one-payer-1000 | native | 87.07% | 87.15% | FAIL | FAIL |
| one-payer-1000 | token | 91.35% | 91.41% | PASS | FAIL |
| one-payer-10000 | native | 96.81% | 96.82% | PASS | FAIL |
| one-payer-10000 | token | 97.96% | 97.96% | PASS | FAIL |
| hundred-payers-10000 | native | 93.17% | 93.65% | PASS | FAIL |
| hundred-payers-10000 | token | 94.37% | 94.66% | PASS | FAIL |

The fresh-recipient and independent-payer controls prevent a concentrated-payment result from being labeled a universal gain.
Proof anchoring, service-manifest verification, real-network prices, off-chain operations and settlement-window latency remain outside this experiment. Include them before deciding platform viability.
