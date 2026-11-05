# Direct ETH checkout benchmark

Local Prague receipts from anvil/v1.4.4. These are synthetic shopper-to-merchant workloads with no customer-to-customer payments.
A checkout quote specifies the price, estimated network fee, chain and destination wallet. The wallet sends one plain transfer with empty calldata and the reviewed nonce. The merchant verifies the mined transaction against that quote.
P0 uses one plain ETH transfer per purchase. P0-net uses one plain ETH transfer per shopper/merchant pair over the entire window. All three finish with equivalent fee-adjusted wallet balances.
P0-net combines purchases into one later settlement. The checkout path confirms purchases individually as transactions are mined.

| Shoppers | Merchants | Purchases per shopper | P0 gas | P0-net gas | Checkout gas | Checkout fee (wei) | Extra gas vs P0 | Extra gas vs P0-net |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 20 | 1 | 1 | 420000 | 420000 | 420000 | 840000000000000 | 0.00% | 0.00% |
| 20 | 1 | 10 | 4200000 | 420000 | 4200000 | 8400000000000000 | 0.00% | 900.00% |
| 20 | 3 | 10 | 4200000 | 1260000 | 4200000 | 8400000000000000 | 0.00% | 233.33% |

No contract deployment, deposits or withdrawals are required. Results cover local transaction costs. Wallet interaction time, merchant hosting costs, and public-network fees are unmeasured.
