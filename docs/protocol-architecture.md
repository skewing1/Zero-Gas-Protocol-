# Protocol architecture

Sinister Rabbit is a shared execution and settlement network for EVM-compatible chains. Wallets, agents, payment facilitators, and applications integrate through the same intent format. Each chain still charges for transactions. The protocol aims to lower total cost through aggregation and make native gas optional for users through sponsorship or reimbursement in a supported asset.

## System boundaries

| Layer | Responsibility |
| --- | --- |
| Intent | Sign the allowed action, source and destination domains, amount, fee cap, deadline, and unique nonce. Bind signatures to the protocol version and verifying contract. |
| Quote and admission | Quote a route and its maximum user fee. Check liquidity, sponsor budget, intent validity, and expiry before accepting work. |
| Execution network | Independent relayers select routes and batches, front native gas, and submit transactions. Separate custody and settlement verification from the relay service. |
| Chain adapters | Verify authorizations, enforce replay protection and fee limits, execute supported actions, and emit settlement records. Keep chain-specific finality and fee policies behind adapters. |
| Settlement | Verify destination execution under the configured route's proof or bridge trust model before paying relayers. Define timeouts, refunds, and reconciliation for delayed finality and reorgs. |
| Accounting | Track native gas, data fees, bridge fees, failed attempts, and relayer reimbursement per route and settled intent. |

## First end-to-end milestone

Implement a signed transfer intent on two local EVM chains. Use a prefunded destination executor and an explicitly trusted test verifier to isolate the state machine before selecting a production verification model. Drive the flow through a command-line test harness using the same interface a wallet or agent would use.

1. Accept a signed intent with an explicit fee cap and expiry.
2. Escrow source funds, execute on the destination, and record the receipt.
3. Release reimbursement only after verifying the receipt. Exercise duplicate submissions, invalid proofs, failed destination execution, and timeout refunds.
4. Compare separate versus batched execution using actual transaction receipts. Report source and destination gas, amortized overhead, and who pays each cost. Keep simulated bridge costs distinct from measured fees.

## Acceptance criteria

- A valid intent settles at most once, including after retries or relay replacement.
- Execution, reimbursement, and refunds respect the signed limits. Refund and successful settlement are mutually exclusive.
- A relayer cannot claim reimbursement with a receipt from the wrong chain, contract, or intent.
- A chain or relayer outage produces a recoverable state under the route's documented timeout and finality rules.
- The benchmark reports total network cost and user-paid cost separately. Any near-zero claim identifies the payer, route, and workload.

The existing transfer benchmark is a component test for batching. Its execution-gas measurement is one input to the system cost model. The initial action is a transfer. Broader contract calls require explicit execution and authorization rules.
