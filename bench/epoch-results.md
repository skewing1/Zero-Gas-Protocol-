# Compact signed settlement epochs: matched settlement-window baseline

Measured on local Anvil, Prague. All gas and fees come from actual receipts.
P0 (per-payment transactions) sends every original payment separately; saving vs P0 includes the effect of choosing to settle in aggregate.
P0-net (same settlement window, no protocol) sends one plain transfer per nonzero payer/payee total, independently for each payer.
P0, P0-net and epoch start from the same setup state. Final recipient balances match; payer principal is checked after accounting for each payer’s receipt-derived gas.
The complete ordered epoch payment list is reconstructible from its lossless periodic encoding. Irregular sequences retain every record.
Cold epoch gas includes protocol deployment and delegation. All-in savings additionally include the same token deployment and payer funding on both sides.
The 90% and 99% decision gates use P0-net, not P0. Negative saving means the protocol costs more.
Epoch submission and delegation transactions are capped at 100 accounts each so the 1,000-payer workload fits transaction limits. All chunk receipts are counted.
Zero relayer reimbursement is used; relayer network fees are counted. Native initial balances are equal fixtures. Proof, service verification and off-chain operating costs remain excluded.

| Workload | Asset | Payments | P0 gas | P0-net gas | Epoch settlement gas | Epoch cold gas | Saving vs P0, all-in* | Saving vs P0-net, all-in |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| unique-payers-unique-payees-1000 | native | 1000 | 21000000 | 21000000 | 88469334 | 110493867 | -426.16% | -426.16% |
| unique-payers-unique-payees-1000 | token | 1000 | 46417880 | 46417880 | 80476394 | 102500927 | -57.14% | -57.14% |
| fresh-unique | native | 100 | 2100000 | 2100000 | 3764887 | 5658220 | -169.44% | -169.44% |
| fresh-unique | token | 100 | 5116088 | 5116088 | 2942759 | 4836092 | 5.11% | 5.11% |
| fresh-distinct-payers | native | 100 | 2100000 | 2100000 | 6386277 | 10259610 | -388.55% | -388.55% |
| fresh-distinct-payers | token | 100 | 3101780 | 3101780 | 6091061 | 9964394 | -80.25% | -80.25% |
| one-payer-1000 | native | 1000 | 21000000 | 210000 | 486846 | 2380179 | 88.67% | -1033.42% |
| one-payer-1000 | token | 1000 | 34274000 | 507398 | 407004 | 2300337 | 92.32% | -207.00% |
| one-payer-10000 | native | 10000 | 210000000 | 210000 | 486846 | 2380179 | 98.87% | -1033.42% |
| one-payer-10000 | token | 10000 | 341244200 | 507398 | 407016 | 2300349 | 99.22% | -207.00% |
| one-payer-10000-irregular | native | 10000 | 210000000 | 210000 | 2991935 | 4885268 | 97.67% | -2226.32% |
| one-payer-10000-irregular | token | 10000 | 341244200 | 507398 | 2911935 | 4805268 | 98.49% | -496.19% |
| hundred-payers-10000 | native | 10000 | 210000000 | 2100000 | 8742434 | 12615767 | 93.99% | -500.75% |
| hundred-payers-10000 | token | 10000 | 340769000 | 3102980 | 8447098 | 12320431 | 94.87% | -107.76% |

*Saving vs P0 includes the effect of choosing to settle in aggregate; it is not the protocol-specific improvement.

## Settlement-only sensitivity (deployment and delegation excluded)

| Workload | Asset | Saving vs P0* | Saving vs P0-net | P0 txs | P0-net txs | Epoch settlement txs |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| unique-payers-unique-payees-1000 | native | -321.28% | -321.28% | 1000 | 1000 | 10 |
| unique-payers-unique-payees-1000 | token | -73.37% | -73.37% | 1000 | 1000 | 10 |
| fresh-unique | native | -79.28% | -79.28% | 100 | 100 | 1 |
| fresh-unique | token | 42.48% | 42.48% | 100 | 100 | 1 |
| fresh-distinct-payers | native | -204.11% | -204.11% | 100 | 100 | 1 |
| fresh-distinct-payers | token | -96.37% | -96.37% | 100 | 100 | 1 |
| one-payer-1000 | native | 97.68% | -131.83% | 1000 | 10 | 1 |
| one-payer-1000 | token | 98.81% | 19.79% | 1000 | 10 | 1 |
| one-payer-10000 | native | 99.77% | -131.83% | 10000 | 10 | 1 |
| one-payer-10000 | token | 99.88% | 19.78% | 10000 | 10 | 1 |
| one-payer-10000-irregular | native | 98.58% | -1324.73% | 10000 | 10 | 1 |
| one-payer-10000-irregular | token | 99.15% | -473.90% | 10000 | 10 | 1 |
| hundred-payers-10000 | native | 95.84% | -316.31% | 10000 | 100 | 1 |
| hundred-payers-10000 | token | 97.52% | -172.23% | 10000 | 100 | 1 |
