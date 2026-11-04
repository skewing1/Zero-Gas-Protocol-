# Protocol architecture

## The user network

Sinister Rabbit is an alternative internet platform where individuals participate directly. Users create identities, publish and discover content and services, communicate, and transact through a shared network. Ethereum is the initial settlement and verification anchor. Other EVM networks connect through chain adapters as their security, finality, and fee policies are qualified.

The platform has its own user and service layer. EVM contracts support ownership and settlement where those guarantees are needed. A page view, search, or message should not require an EVM transaction. The first prototype should use signed, portable user records and off-chain delivery, with optional on-chain commitments where independent verification matters. A commitment proves integrity for available data. Storage and retrieval are separate responsibilities.

| Network component | Initial responsibility |
| --- | --- |
| Client and identity | Provide one user-facing entry point. Sign portable identity and service actions, with explicit key recovery and revocation rules. |
| Content and discovery | Publish, retrieve, and index signed records. Keep private communications off public chains. Define how users export data and how records remain available if an operator goes offline. |
| Execution and settlement | Route and settle eligible actions through Ethereum and qualified EVM networks. Batch where useful and record who pays each fee. |

### First integrated prototype

Build a thin client where two users can create identities, publish and discover a service, and complete one paid interaction. Publish and discover using signed records without submitting chain transactions. Verify the payment through the Ethereum settlement path. Then repeat the flow through a second EVM adapter and report the differences in fees, time to finality, and trust assumptions.

Measure gas per completed user workflow, including commitments, settlement, claims, and recovery transactions when required. Report user-paid fees separately from total network cost and keep off-chain operating costs visible. Compare workflows with equivalent ownership, payout, and recovery guarantees. The transfer, Merkle claim, and netting benchmarks measure settlement components within this larger system.

## Execution and settlement subsystem

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
