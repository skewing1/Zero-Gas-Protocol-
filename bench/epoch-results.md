# Compact signed settlement epochs

Measured on local Anvil, Prague. Every baseline payment is a separate mined transaction.
Each payer explicitly signs an entire settlement window. The complete ordered payment list is reconstructible from the lossless periodic encoding in calldata.
The account computes recipient totals on-chain. Recipients receive consolidated transfers at window settlement.
The irregular control uses deterministic varied amounts; it retains all 10,000 pattern records.
Receipt checks assert matching final wallet balances. Intermediate spendability and per-payment event counts differ.
Steady cost includes execution and signature verification. Cold cost adds all protocol deployment and delegation.
All-in savings also include the same token fixture deployment and payer funding on both sides.
The trial uses zero relayer reimbursement. Network gas is still paid by the relayer and counted.
Initial native balances are fixtures, set equally for both paths. No off-chain operating costs are priced.

| Workload | Asset | Payments | P0 gas | Epoch gas | Cold gas | Encoded pattern records | Settlement saving | All-in saving |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| fresh-unique | native | 100 | 2100000 | 3764887 | 5658220 | 100 | -79.28% | -169.44% |
| fresh-unique | token | 100 | 5116088 | 2942759 | 4836092 | 100 | 42.48% | 5.11% |
| fresh-distinct-payers | native | 100 | 2100000 | 6386277 | 10259610 | 100 | -204.11% | -388.55% |
| fresh-distinct-payers | token | 100 | 3101780 | 6091061 | 9964394 | 100 | -96.37% | -80.25% |
| one-payer-1000 | native | 1000 | 21000000 | 486846 | 2380179 | 100 | 97.68% | 88.67% |
| one-payer-1000 | token | 1000 | 34274000 | 407004 | 2300337 | 100 | 98.81% | 92.32% |
| one-payer-10000 | native | 10000 | 210000000 | 486846 | 2380179 | 100 | 99.77% | 98.87% |
| one-payer-10000 | token | 10000 | 341244200 | 407016 | 2300349 | 100 | 99.88% | 99.22% |
| one-payer-10000-irregular | native | 10000 | 210000000 | 2991935 | 4885268 | 10000 | 98.58% | 97.67% |
| one-payer-10000-irregular | token | 10000 | 341244200 | 2911935 | 4805268 | 10000 | 99.15% | 98.49% |
| hundred-payers-10000 | native | 10000 | 210000000 | 8742434 | 12615767 | 10000 | 95.84% | 93.99% |
| hundred-payers-10000 | token | 10000 | 340769000 | 8447098 | 12320431 | 10000 | 97.52% | 94.87% |
