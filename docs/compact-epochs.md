# Experimental compact settlement windows

Status: research branch; local measurements only. This is a payment aggregation experiment, not a replacement for the service-bound ProtocolAccount intent format or a universal savings claim.

Each payer signs one EIP-712 Epoch authorizing a complete list of payments during a settlement window. Funds remain in the payer's delegated EOA. Anyone can submit the epoch. The account checks the signature, chain/account domain, deadline, nonce and fee cap, computes totals from the complete public calldata, and transfers directly to each recipient. The settler never holds funds. Cancellation and reentrancy protection share the existing account's namespaced nonce lanes and transient lock.

Version 2 begins with a four-byte big-endian repetition count and a two-byte pattern length. Each pattern record occupies nine bytes: a one-byte recipient-table index and an eight-byte big-endian positive amount. The complete ordered payment list is this pattern repeated the signed number of times. The SDK finds the shortest exact period with a linear-time prefix algorithm. Irregular sequences use one repetition and retain every record. This is ordinary lossless encoding, not a cryptographic aggregation scheme.

The table contains at most 256 recipients; a pattern contains 1–65,535 records and repetitions range from 1 to 2^32−1. Amounts must be positive uint64 values. Larger inputs must be split into separately authorized epochs; unsupported values are rejected without truncation. The recipient table and the complete encoded packet, including its repetition count, are signed. The account computes pattern totals and multiplies them by the repetition count on-chain. No off-chain party supplies unchecked totals.

The EIP-712 epoch domain is now `ProtocolEpochAccount`, version `2`. Version-1 epoch signatures are rejected. This requires a new implementation deployment and explicit user delegation; no existing delegation is changed automatically. The inherited individual-intent interface remains available.

## Meaning of the comparison

The receipt benchmark compares actual separate EOA transactions with a single settlement window. Both produce identical final recipient wallet balances. The comparison deliberately exposes two changes: payments become spendable together at window settlement, and consolidated transfers produce fewer transfer events. Applications that require immediate spendability after every payment cannot substitute this path unchanged.

One signature authorizes an entire window. Independently signed per-payment intents cannot be silently converted into an epoch. A payer must approve the window. Service IDs and manifest hashes are not part of this experimental payment encoding; PR2 service-access proofs do not yet accept these receipts. No anchoring costs, identity lifecycle costs or off-chain operating costs are claimed as measured here. This is not the full-platform decision benchmark.

Deployment and delegation are reported separately and included in the cold-start total. Token deployment and initial token funding are shared fixtures, included on both sides in the all-in column. Native initial funding uses equal Anvil fixtures. Zero relayer reimbursement is used, but every relayer transaction's network gas and fee remain counted. A relayer still needs a viable reimbursement policy; sponsor-paid gas is not erased.

Fee-on-transfer and rebasing tokens are unsupported for equal-outcome claims. The benchmark uses the standard BenchToken. Current delegation revocation prevents execution; reattaching the implementation may revive an unused signature. Cancel its nonce lane for permanent invalidation.

## Reproduction

Use the repository's pinned Foundry 1.3.1, solc 0.8.30, OpenZeppelin 5.0.2 and Node 20.19.4 dependencies.

```sh
npm --prefix node ci
npm --prefix node run build
forge test
node --test node/test/epochs.test.mjs
anvil --hardfork prague --chain-id 31337 --prune-history
# In another terminal from the repository root:
node scripts/bench-epochs.mjs --reset-between
```

The harness accepts only local chain 31337 and uses public development keys. It records every transaction receipt in `bench/epoch-results.json`, including gas, effective fees and calldata. It asserts final balances after both paths. Never use these keys on a public network.

## Decision gate

The target remains 90–99% lower total network cost for equivalent useful outcomes. Passing a concentrated workload does not pass that gate for independent payers or fresh recipients. Report each workload separately. Existing EVM costs are unchanged by this protocol. Universal gains require reducing how much execution the base chain performs, which introduces additional settlement, proof, data-availability and exit requirements. Those must be implemented and measured before making a broader claim.

Wallet signing displays commitment hashes. A signing client must display the complete recipient table, payments, totals, fee cap, deadline and nonce lane before requesting the signature, and recompute both hashes locally. Blind approval of hashes supplied by an operator is unsafe. The current SDK exposes that payment data and computed totals; a production wallet review flow and external audit are still required.

`--scenario=<name>` selects a diagnostic workload. Use `--output=<directory>` to keep diagnostic results separate. The target decision command requires all six workloads for both assets and rejects incomplete reports. Signature tracing measures the ECRECOVER precompile calls; it does not treat those calls as the entire signature-handling overhead. Receipt gas already includes hashing, decoding, transfers, events and transaction costs.

A signed window is not a completed payment or a reservation of funds. Until execution the payer can spend the balance elsewhere or cancel the lane. Payees must wait for successful settlement and the chain's finality policy before treating a payment as final. Serving a paid request before then introduces credit risk, which this gas benchmark does not price. No funds are locked by signing an epoch.


`--reset-between` resets the dedicated local Anvil between workload/asset cases to discard old state history. It is opt-in and must not be used against a development node containing work you want to retain. P0 and epoch execution still start from the same snapshot within each case. Every receipt is saved before resetting. CI uses this option on its own disposable node.

The report includes an irregular 10,000-payment control with deterministic varied amounts, and records each payer's pattern length and repetition count. Repetition-specific savings must not be generalized to independent user signatures or random payment sequences. The logical payment count describes the payer-authorized sequence, not separately authenticated users or verified service deliveries.
