# Distributing execution and sharing settlement cost

Research direction; not an implemented rollup or proof-aggregation system.

Each EVM network charges for transactions it executes. Paying a fraction of
an Ethereum bill on PulseChain does not make Ethereum accept that payment
as its own execution fee. Distributing a transaction to more networks can
increase cost if it duplicates work or adds messages and bridge transactions.

The useful version of the idea is to distribute independent operations and
share the expensive common work:

1. Transactors sign constrained requests with recipient, asset, amount,
   accepted networks, deadline and total fee budget.
2. Independent operators quote complete routes. Each operation executes once
   on an eligible network. Actual funds and receiver acceptance constrain it.
3. Within each settlement window, compatible obligations are cleared and
   proofs can be aggregated. Fewer shared settlements can reduce overhead.
4. A canonical commitment can make the results verifiable. Finality, data
   availability, proving and user exit must all be implemented and costed.

This is execution distribution plus settlement aggregation. Proof verification
cost sharing is an existing scaling technique, not evidence that our project
has achieved a savings target. Arbitrary EVM chains do not automatically
participate in one proof system. Every adapter needs an authenticated finality
and asset-accounting path. The existing hub proof system remains unimplemented
as documented in `bench/hub-decision.md`.

## Components now present

`network/low-fee/router.mjs` selects the lowest complete estimated cost among
fresh direct-transfer observations. It checks chain acceptance, asset address,
transfer identity, balances and fee reserves, cost completeness, freshness and
the fee budget. Selection runs locally and never broadcasts. Current policy
vectors are synthetic tests; they are not live multi-chain routing results.
Native/USDC wallet quote components exist separately; collecting and verifying
all adapters into one user interface is still pending.

The selector deliberately rejects cross-chain routes until an execution
adapter exists. `evaluateChainMove` can compare complete supplied entry,
ongoing and exit costs with staying on the original chain. Missing costs or
unequal outcomes prevent a decision. It computes conditional break-even volume
and the minimum volume for 90% or 99%, returning null when the destination's
per-payment cost makes a target unattainable. These calculations are estimates
unless populated from completed equivalent routes and actual receipts.

## Experiment needed before a shared-settlement implementation

Use fresh/disjoint transactors as well as mixed and repeated flows. Compare
against direct transfers and per-pair window totals. Require the same final
spendable wallet funds. Sum receipts from every participating chain and include
proof generation, DA, operator cost, initial funding, rebalancing and all exits.
Report the fee per completed payment, user cost, finality and failure exits.
A bridge or x402 label supplies no savings by itself. No target is claimed here.

Keep the transactor interface recipient, asset, amount, fee and approval.
Routing, batching and proofs belong behind that interface, with material
security and asset differences disclosed before approval.

Primary references checked 2026-11-05:

- https://ethereum.org/developers/docs/gas/
- https://ethereum.org/developers/docs/scaling/zk-rollups/
- https://polygon.technology/agglayer

Polygon describes shared verification costs; that does not establish its
current deployment configuration, fees or suitability for this platform.
