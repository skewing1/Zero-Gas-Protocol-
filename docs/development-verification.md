# Development verification status

The 2026-11-05 local run completed all four `--transactors` workloads, checking final wallet balances and reviewed-transfer receipt fees. Nine record/transfer unit tests passed. These are local native-asset measurements, not a production-readiness claim.

An initial run of the older `--checkout` benchmark failed with `Transaction does not pay this quote`. A diagnostic rerun and three consecutive subsequent runs passed. The initial mismatch was not captured in sufficient detail to identify its cause; it remains unresolved. No production or public-network payment verification guarantee is made. CI was updated but its result has not been checked in this session. The Solidity suite was not rerun because no contracts changed; the benchmark used the existing compiled artifact and records its bytecode hash.

Quotes remain in memory, and transaction status is based on one mined block. Persistence, reorg/finality handling, long-term fee sampling, fresh/zero-gas recipient exits, and wallet integration on the additional candidate chains remain open. The network screen has missing samples and RPC failures, and Gnosis's unusually low sampled gas prices require independent verification. All comparative USD figures are price conversions, not measured dollar charges.
