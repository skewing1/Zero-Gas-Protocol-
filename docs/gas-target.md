# Gas reduction target

The product goal is a 90% reduction in total network fees per completed payment, with 99% as the stretch target. User-paid fees and total network fees are measured separately. Sponsorship reallocates cost.

Compare identical assets, final spendability, security guarantees, and workload. Report improvements against direct transfers on the same chain and against direct Ethereum L1 separately. The same-chain comparison measures the protocol's contribution. Fees from another chain use that chain's fee market and are not comparable by summing raw gas units.

For the native L1 benchmark, 100 separate plain transfers consume 2,100,000 gas. At an unchanged gas price, a 90% reduction allows 210,000 gas total and 99% allows 21,000. The current delegated-account path executes each transfer on the underlying chain. The measured path does not meet either budget.

Next decisions:
1. Finish the reproducible receipt harness and preserve failing workloads.
2. Quantify what compact calldata and shared authorization save while preserving account ownership and payout guarantees.
3. Evaluate an Ethereum-settled execution layer that aggregates many user transitions into shared proofs and data publication. Measure batches of 100, 1,000, and 10,000 actions, including proof generation, data availability, settlement, entry and exit, and anchoring. Use an established proof stack.
4. Report the capital location and trust implications. Moving execution away from L1 cannot preserve the claim that each payment immediately changes an ordinary L1 EOA balance. An anchored receipt alone does not prove a valid state transition.
5. Keep existing-chain adapters for interoperability. Separate their overhead from the shared execution layer's cost.

Identity, discovery, messaging, and proof anchoring are product capabilities. They do not by themselves demonstrate a lower cost for moving funds. Gate expansion on measured cost and a specified exit mechanism.

## Compact-epoch experiment

`EpochAccount` implements shared payer authorization with complete compact payment calldata and on-chain aggregation. `bench/epoch-decision.md` evaluates all fresh-recipient, independent-payer and repeated-payment controls. Cold-start savings include deployment and delegation; the shared token setup is counted on both sides. Receipt fees include the relayer's gas even with zero reimbursement.

The next architectural gate remains the fresh-recipient and independent-payer workloads. Concentrating more obligations into a window improves amortization but also increases waiting and cannot establish an immediate-payment platform gain. Service-bound receipts, proof costs and the full-network decision benchmark must be included before claiming the overall goal.

The compact experiment's call traces measure 300,000 gas in ECRECOVER alone for 100 independent payer epochs. Their direct native baseline is 2,100,000 gas, giving a 210,000-gas budget at 90% savings. This signature-only cost already exceeds that budget, before nonce storage, transfers, calldata or deployment. With one ECDSA verification per independent payer, further packing cannot close this gap. This lower bound applies to the measured ECDSA-based design, not every possible future settlement model.

Version 2 adds a bounded calldata decoder and lossless periodic encoding. Its irregular-payment control retains the full pattern, so the report separates general decoding gains from repetition compression. ECDSA checks remain one per payer epoch: these changes do not remove the independent-payer lower bound. Repeating a payment sequence is an explicit payer authorization, not aggregation of independent signatures. The version-2 decision gate still requires every control and both assets.
