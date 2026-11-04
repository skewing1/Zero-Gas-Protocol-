# Canonical origin escape — implementation specification v0

## Decision

Replace independent stale-root payouts with a permissionless canonical freeze on
Ethereum. A local portal timeout enters `ESCAPE_REQUESTED`: it stops new deposits
but does not pay balances from an old root. A user or replacement operator submits
an authenticated mature request to Ethereum. Ethereum freezes that origin at its
current accepted hub state. Anyone exports the finalized freeze to the portal.
The portal enters terminal `EXIT_ONLY` and pays balances from that exact snapshot.

The freeze itself must be executable by the settlement contract without a new
hub-transition proof. Export still needs a proof and archived data. No privileged
operator is required, but someone must run the software and pay its costs.

## Contract/program agreement required

1. Freeze record commits origin, snapshot root, snapshot version, imported deposit
   cursor, outstanding withdrawal commitment and a permanent frozen flag.
2. Ethereum stores an append-only commitment to frozen origins. Every later hub
   proof takes that commitment as a public input, and the settlement contract
   requires it to equal the current on-chain commitment at submission time.
3. The program rejects every mutation involving a frozen origin: transfers,
   deposits, fees, swaps, withdrawal creation and later liquidity operations.
   A proof produced before the freeze cannot pass after the freeze commitment
   changes. Swaps touching either frozen side fail atomically.
4. A portal requires a finalized authenticated export of the freeze, not merely a
   newer ordinary state root. It never switches snapshots once EXIT_ONLY begins.
5. Account exits, withdrawal claims and deposit refunds use distinct domain-bound
   nullifiers, stored before sending funds. Recipient ownership is proven; a
   relayer cannot substitute its own destination. Claims remain permissionless.
6. Already claimed withdrawals remain marked claimed across root changes.
   Withdrawals debited before freeze remain claimable once and are absent from
   account balances. Deposits beyond the frozen import cursor are refunded to
   their original owners once; imported deposits cannot also be refunded.

## Race outcomes

| Ethereum ordering | Outcome |
|---|---|
| Swap accepted, then freeze | Snapshot assigns the acquired asset to the buyer |
| Freeze, then swap submission | Swap proof fails the current frozen-origin commitment check |
| Old export delivered after freeze export | Portal rejects it |
| Withdrawal claimed before freeze | Claim nullifier remains spent; no second payment |
| Deposit not imported at freeze | Original depositor receives refund; never hub credit |

This sacrifices asynchronous local escape liveness to preserve ownership. If
Ethereum halts, canonical freezes and exports wait. If the spoke halts, its payouts
wait. Do not promise immediate local exits during either condition. Total loss of
operators is distinct from loss of Ethereum consensus or unavailable proof data.

## Request handling still to implement

A request must identify an authenticated forced operation, deadline and owner.
The settlement contract must distinguish processed requests from censored ones;
unconditional requests that freeze an entire origin allow cheap denial of service.
The deadline cannot be extended by another request or unrelated heartbeat.
Authenticated spoke evidence is needed to introduce local requests on Ethereum.
An Ethereum request path also needs a defined finality and challenge policy.
These are required before this specification is deployable.

## Executable model

`node --test hub/model/escape.test.mjs hub/spec/exit-safety.test.mjs`

The new model resolves the stale-root ownership counterexample under the explicit
assumption that exports have already been authenticated. Eight tests pass,
including 1,000 amount/ordering combinations, and retain the original attack test.
This is a deterministic reference model, not a deployed protocol. Its export
objects are not proofs. It models one asset per origin; multi-asset commitments,
real identities/signatures, finality, SMT/MPT proofs, SP1 and blob binding remain
to be implemented. Model callers stand in for authenticated owners.

## Cost impact

Normal operation still batches payments. Canonical escape adds exceptional
Ethereum and export costs, which must be benchmarked as single-user exit costs.
Do not hide them or claim a 90% reduction before receipt and proving measurements.
