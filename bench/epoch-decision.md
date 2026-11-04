# Compact-epoch target decision: P0-net controls the gate

90% across all measured controls versus P0-net: **FAIL**.
Full-platform 90–99% target: **NOT ESTABLISHED**. This experiment measures payments only.
P0 = per-payment transactions. Saving vs P0 includes the effect of choosing to settle in aggregate.
P0-net = same settlement window, no protocol: plain transfers of each payer/payee total. Both the 90% and 99% gates use P0-net.
All-in savings include protocol deployment and delegation; identical token setup is counted on both sides. Raw gas columns exclude this shared token setup.
All paths assert equal final recipient balances and gas-adjusted payer principal. Negative saving means increased cost.

| Workload | Asset | P0 gas | P0-net gas | Epoch cold gas | Saving vs P0, all-in* | Saving vs P0-net, all-in | 90% vs P0-net | 99% vs P0-net |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- | --- |
| fresh-unique | native | 2100000 | 2100000 | 5658220 | -169.44% | -169.44% | FAIL | FAIL |
| fresh-unique | token | 5116088 | 5116088 | 4836092 | 5.11% | 5.11% | FAIL | FAIL |
| fresh-distinct-payers | native | 2100000 | 2100000 | 10259610 | -388.55% | -388.55% | FAIL | FAIL |
| fresh-distinct-payers | token | 3101780 | 3101780 | 9964394 | -80.25% | -80.25% | FAIL | FAIL |
| one-payer-1000 | native | 21000000 | 210000 | 2380179 | 88.67% | -1033.42% | FAIL | FAIL |
| one-payer-1000 | token | 34274000 | 507398 | 2300337 | 92.32% | -207.00% | FAIL | FAIL |
| one-payer-10000 | native | 210000000 | 210000 | 2380179 | 98.87% | -1033.42% | FAIL | FAIL |
| one-payer-10000 | token | 341244200 | 507398 | 2300349 | 99.22% | -207.00% | FAIL | FAIL |
| hundred-payers-10000 | native | 210000000 | 2100000 | 12615767 | 93.99% | -500.75% | FAIL | FAIL |
| hundred-payers-10000 | token | 340769000 | 3102980 | 12320431 | 94.87% | -107.76% | FAIL | FAIL |
| one-payer-10000-irregular | native | 210000000 | 210000 | 4885268 | 97.67% | -2226.32% | FAIL | FAIL |
| one-payer-10000-irregular | token | 341244200 | 507398 | 4805268 | 98.49% | -496.19% | FAIL | FAIL |
| unique-payers-unique-payees-1000 | native | 21000000 | 21000000 | 110493867 | -426.16% | -426.16% | FAIL | FAIL |
| unique-payers-unique-payees-1000 | token | 46417880 | 46417880 | 102500927 | -57.14% | -57.14% | FAIL | FAIL |

*Includes the effect of choosing to settle in aggregate. This reference column is not a measure of protocol-specific savings.

## Actual local fee savings, all-in

| Workload | Asset | Saving vs P0* | Saving vs P0-net |
| --- | --- | ---: | ---: |
| fresh-unique | native | -168.56% | -168.56% |
| fresh-unique | token | 5.45% | 5.45% |
| fresh-distinct-payers | native | -340.53% | -340.53% |
| fresh-distinct-payers | token | -68.46% | -68.46% |
| one-payer-1000 | native | 88.75% | -1024.66% |
| one-payer-1000 | token | 92.38% | -204.87% |
| one-payer-10000 | native | 98.88% | -1024.66% |
| one-payer-10000 | token | 99.23% | -204.87% |
| hundred-payers-10000 | native | 94.47% | -452.73% |
| hundred-payers-10000 | token | 95.16% | -95.97% |
| one-payer-10000-irregular | native | 97.68% | -2217.56% |
| one-payer-10000-irregular | token | 98.49% | -494.06% |
| unique-payers-unique-payees-1000 | native | -378.14% | -378.14% |
| unique-payers-unique-payees-1000 | token | -46.87% | -46.87% |

Local fee prices are not mainnet projections. Proof anchoring, service verification and off-chain operating costs remain unmeasured.
