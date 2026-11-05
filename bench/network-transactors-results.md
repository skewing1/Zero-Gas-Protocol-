# Network transactor lifecycle benchmark

Measured local Prague receipts: anvil/v1.4.4. Native ETH only. Every participant starts with spendable ETH, including gas. No fresh or zero-gas recipient claim is tested.
P0 sends each payment directly. P0-net sends each payer/payee window total directly. The pilot deposits, jointly signs one clearing window, and withdraws all funds to wallets. Every route starts at the same snapshot and asserts fee-adjusted final wallet balances.
Pilot totals include deployment, every deposit, signed clearing, and every withdrawal. Only net debtors fund their exact window deficit; net creditors withdraw their proceeds. Every participant still signs. This is optimized window clearing, with funds usable only when the whole window clears.
This pilot requires unanimous participant signatures and off-chain payment-list verification and retention. It is not a validity-proven hub. Proof production, durable data publication and operating costs remain unmeasured. Gates below apply only to the measured local pilot.

| Workload | Payments | P0 gas | P0-net gas | Full pilot gas | Saving vs P0 (includes aggregation) | Saving vs P0-net | 90% vs P0-net | 99% vs P0-net |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- |
| unique-payers-unique-payees | 20 | 420000 | 420000 | 4521828 | -976.63% | -976.63% | FAIL | FAIL |
| peer-ring-repeated | 200 | 4200000 | 420000 | 2864489 | 31.80% | -582.02% | FAIL | FAIL |
| mixed-peer-network | 200 | 4200000 | 2940000 | 2897194 | 31.02% | 1.46% | FAIL | FAIL |
| all-peers-once-per-pair | 380 | 7980000 | 7980000 | 2923250 | 63.37% | 63.37% | FAIL | FAIL |

| Workload | Reviewed-transfer gas | Extra gas vs plain P0 | Receipt fee reconciliation |
| --- | ---: | ---: | --- |
| unique-payers-unique-payees | 420000 | 0 | PASS |
| peer-ring-repeated | 4200000 | 0 | PASS |
| mixed-peer-network | 4200000 | 0 | PASS |
| all-peers-once-per-pair | 7980000 | 0 | PASS |

The reviewed-transfer route uses user-selected recipients and amounts. Quote IDs remain off-chain. Verification checks the payer, payee, amount, transaction nonce, empty calldata and canonical mined block. This route matches plain-transfer execution cost and claims no saving over plain transfers on the same chain.

Fresh recipients, ERC-20, public networks, validity proofs, and the complete proposed system remain unmeasured here. These rows cannot establish platform-wide 90–99% savings.
