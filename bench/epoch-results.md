# Compact signed settlement epochs

Measured on local Anvil, Prague. Every baseline payment is a separate mined transaction.
Each payer explicitly signs an entire settlement window. Every original payment remains in transaction calldata.
The account computes recipient totals on-chain. Recipients receive consolidated transfers at window settlement.
Receipt checks assert matching final wallet balances. Intermediate spendability and per-payment event counts differ.
Steady cost includes execution and signature verification. Cold cost adds all protocol deployment and delegation.
All-in savings also include the same token fixture deployment and payer funding on both sides.
The trial uses zero relayer reimbursement. Network gas is still paid by the relayer and counted.
Initial native balances are fixtures, set equally for both paths. No off-chain operating costs are priced.

| Workload | Asset | Payments | P0 gas | Epoch gas | Cold gas | Settlement saving | All-in saving |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| fresh-unique | native | 100 | 2100000 | 3762539 | 5579504 | -79.17% | -165.69% |
| fresh-unique | token | 100 | 5116088 | 2936411 | 4753376 | 42.60% | 6.63% |
| fresh-distinct-payers | native | 100 | 2100000 | 6308833 | 10105798 | -200.42% | -381.23% |
| fresh-distinct-payers | token | 100 | 3101780 | 6009557 | 9806522 | -93.75% | -78.40% |
| one-payer-1000 | native | 1000 | 21000000 | 899210 | 2716175 | 95.72% | 87.07% |
| one-payer-1000 | token | 1000 | 34274000 | 818810 | 2635775 | 97.61% | 91.35% |
| one-payer-10000 | native | 10000 | 210000000 | 4889091 | 6706056 | 97.67% | 96.81% |
| one-payer-10000 | token | 10000 | 341244200 | 4808703 | 6625668 | 98.59% | 97.96% |
| hundred-payers-10000 | native | 10000 | 210000000 | 10545786 | 14342751 | 94.98% | 93.17% |
| hundred-payers-10000 | token | 10000 | 340769000 | 10246522 | 14043487 | 96.99% | 94.37% |
