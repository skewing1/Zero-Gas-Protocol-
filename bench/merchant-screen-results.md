# Can the funded hub reach 90% on merchant payments?

Local Prague receipts from anvil/v1.3.1.
Each shopper deposits exactly enough for the full window. Merchants withdraw once each. All routes reach equivalent final wallet balances after fees. The clearing contract uses real signatures.
The entry and exit column removes all settlement and deployment gas from the measured pilot. It gives an optimistic cost for this funding and cash-out design. Data publication and operating costs are also omitted from that column.

| Shoppers | Merchants | Purchases per shopper | P0 gas | P0-net gas | Full pilot gas | Entry and exit alone | Full gas budget at 90% vs P0-net |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 20 | 1 | 1 | 420000 | 420000 | 2941077 | 929518 | 42000 |
| 20 | 1 | 10 | 4200000 | 420000 | 2940861 | 929530 | 42000 |
| 20 | 3 | 10 | 4200000 | 1260000 | 3107203 | 990446 | 126000 |

- 1 purchases per shopper across 1 merchant(s): entry and exit alone use 22.1× the 90% gas budget.
- 10 purchases per shopper across 1 merchant(s): entry and exit alone use 22.1× the 90% gas budget.
- 10 purchases per shopper across 3 merchant(s): entry and exit alone use 7.9× the 90% gas budget.

This screen applies to individually funded native ETH balances on one chain, with wallet payouts at the end of the window. It does not estimate savings on another chain or with an alternative funding model.
