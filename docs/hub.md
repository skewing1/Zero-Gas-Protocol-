# Multi-chain hub: Phase 1 feasibility gate

Status: BLOCKED; not implemented or merged. This branch starts from
pr2-system-layer commit 07e4d7e9fe4887d02db9a553735383db8f30aa9a,
retaining ProtocolAccount and its tests. It does not adopt the ledger-v0 design.
The supplied later-phase descriptions are requirements, not evidence that those
phases have happened. No hub contracts, proof programs, audits or rc1 tag were
found in the repository when this branch was created.

## Direction

An Ethereum-settled validity hub is a materially different experiment from EOA
batching. It may amortize verification and data publication across payments, but
requires locked portal collateral, data availability and a sound escape protocol.
This changes the earlier funds-always-in-EOA architecture. An operator cannot
custody the assets, but contracts necessarily hold deposited collateral.
No saving is established until real proofs, entry, exit and all portal relays
are measured. Keep P0-net comparisons as well as P0; the same payer/payee window
must be available to both baseline and protocol.

## Original exit counterexample

Run `node --test hub/spec/exit-safety.test.mjs`.
These are arithmetic specification tests, not tests of implemented contracts.

1. A's last exported root assigns 100 A units to Alice. B assigns 100 B units to Bob.
2. A canonical hub transition atomically swaps these assets: Bob owns A and Alice owns B.
3. Export reaches B but not A. Both portals later time out independently.
4. Alice exits 100 A using A's stale state and 100 B using B's latest state.
5. Bob's canonical 100 A balance is no longer redeemable.

Every signature and state transition can be valid. Permanently freezing A stops
a second payout but does not make Bob whole. Allowing later roots can instead
create excess claims. The promise that every account exits exactly requires an
additional globally consistent settlement/escape protocol.

Candidate correction, NOT implemented: use per-origin finalized withdrawal
rights and a prepare/commit protocol that locks affected rights before a swap
becomes final. Define recovery for every partial acknowledgement and chain halt.
A simpler first experiment excludes cross-origin swaps and tests one origin;
that does not satisfy the requested multi-chain acceptance criteria. Do not
choose either design without specifying solvency and liveness at every state.
A multi-chain timeout by itself is not a consensus mechanism.

## Other prerequisites

- Evidence freshness: depth-N headers and MPT inclusion prove statements relative
  to a header. They do not authenticate an arbitrary supplied header as canonical.
  Local simulation needs explicit trusted checkpoints. Production needs the
  specified light client and authenticated finality state.
- Forced queues: require authenticated queue head, cursor and evidence freshness.
  Supplying an old evidence block must not hide mature forced entries. A recent
  root arrival cannot substitute for queue progress.
- SMT addressing: depth 32 cannot injectively index 160-bit addresses. Specify an
  authenticated collision-resolution/address-index registry; never truncate an
  address and overwrite a leaf. Asset subtrees and their encodings also need specs.
- Blob binding: EIP-4844 point evaluation authenticates a polynomial opening, not
  arbitrary Rust input. The circuit must bind its exact replayable batch encoding
  to the transaction's blob commitments. Validate blobhash linkage, field bounds,
  multi-blob ordering, canonical padding and adversarial mismatched inputs.
  No calldata fallback is accepted as evidence of blob-mode completion.
- Reconstruction: tables, account-index assignment, deposits, swaps, withdrawals,
  forced entries, fees and all state-changing outcomes must be reconstructible.
  Omitting signatures/nonces is acceptable only if deterministic replay remains
  possible from genesis and every accepted transition's public data.
- Precompile probes require known valid/invalid functional vectors. `eth_getCode`
  returning empty at a precompile does not mean it is unsupported.
- Committee caps bound issued asset units, not USD loss or LP losses automatically.
  Separate fake-credit exposure, legitimate depositor impairment and LP exposure.
- Upgrade semantics: arbitrary implementation/vkey replacement can authorize
  future balance theft. A timelock offers an exit opportunity; it does not mean
  the council can NEVER affect balances. Immutable enforcement boundaries would
  need to constrain every replacement program/implementation.

## Tooling and measurement status

Rust 1.88.0 and SP1 5.2.4 are now installed; the matching SP1 Rust toolchain
was downloaded and checksum-verified. The signed-transfer kernel passes native
Rust tests and its SP1 guest builds. See docs/hub-kernel.md for the reproducible
commands, resource limits, and exact scope. There is still no real Groth16 proof,
export proof, point-evaluation integration or four-chain payment run.
The mandatory blob/proof gate is NOT PASSED. No later phase or launch is ready.

## Corrected exit design

The canonical-origin escape reference model in `hub/model/escape.mjs` now
resolves the stale-snapshot counterexample under authenticated-export assumptions.
See `docs/hub-escape.md` for the chosen protocol, race ordering, refund/claim rules,
and explicit Ethereum-availability tradeoff. This is executable model progress,
not completion of the cryptographic or contract gates.

## Next implementation gate

Resolve and test the exit-state protocol first. Then bootstrap an exact pinned
SP1 toolchain and prove a minimal blob-bound state transition end-to-end, testing
that unrelated valid blob openings cannot authenticate different batch data.
Only after that gate passes build deposit evidence, full transitions and portals.
The real benchmark must count proving operational costs separately from network
fees, and specify the conversion of hardware/prover fees to ETH. Report both
hub-credit completion and origin-wallet completion; do not compare them as equal.

## Primary references

- EIP-4844: https://eips.ethereum.org/EIPS/eip-4844
- SP1 project template: https://github.com/succinctlabs/sp1-project-template

These references establish interfaces, not that this implementation is verified.
Comparisons with AggLayer, Elastic Network and Superchain remain unverified and
are deferred until the actual protocol and its trust model are specified.

## One-chain payment pilot

`NativePaymentPilot` implements ETH deposits, signed batches, balance reuse
between participants and direct withdrawals. It verifies each EIP-712 signature
on chain. The SP1 path remains separate and its proving cost is unmeasured.

Run the pilot using Foundry 1.3.1, Solidity 0.8.30, and Node 20.19.4.

```sh
forge install foundry-rs/forge-std@v1.9.7 --no-git
forge install OpenZeppelin/openzeppelin-contracts@v5.0.2 --no-git
npm --prefix node ci --ignore-scripts
forge test
node scripts/hub/bench-pilot.mjs
```

The script starts a local Prague Anvil and writes the gas report to
`bench/native-pilot-results.md` and every transaction and receipt to
`bench/native-pilot-results.json`. For each of 1, 10 and 100 payments per funded
account it compares the same window against P0 and P0-net. Twenty deterministic
local wallets each pay up to three distinct counterparties. The comparison
checks equivalent wallet principal after all funds leave the pilot.

### Jointly authorized clearing

Run `node scripts/hub/bench-pilot.mjs --clearing` after `forge build`.
The clearing workload adds 101 participants who each pay 100 distinct
counterparties. Every participant signs the same EIP-712 window containing
the hash of the payment list and the ordered entries with owner, nonce and
net delta. The contract checks all signatures, enforces nonce progression
and rejects any window whose deltas do not sum to zero. Each participant can
withdraw directly. Any party can submit a fully signed window.

Clients must verify the full list, check the net amounts and retain the
list to verify payment details later. The benchmark bundles the list with
its receipts. This path requires all participants' consent before clearing.
A participant can withhold a signature or withdraw and leave the proposed
window underfunded. Participants can then use ordinary settlement or form
another window. No individual payment validity proof or persistent data
publication service is included in this experiment.

See `bench/native-clearing-results.md` for the measured execution, entry,
exit and deployment costs. Off-chain coordination, list availability,
and the time to collect signatures remain outside the gas measurement.

### Direct wallet checkout

Run `anvil --hardfork prague` and then `node network/checkout/server.mjs`.
Open http://127.0.0.1:8080 with a local development wallet on chain 31337.
The demo quotes 0.001 ETH to the second Anvil account. Get the price and
estimated fee, then approve one transfer. The wallet shows the final fee
before approval. The merchant matches the mined transaction to a random
16-byte quote identifier, payer, payee, amount, chain and quote window.
The quote store is in memory and verification checks the currently canonical
block with one mined confirmation. This demo records payment status only.
Production fulfillment needs persistent order records and a finality policy.

With Node dependencies installed, run `node scripts/hub/bench-pilot.mjs --checkout`
to benchmark the same client and merchant code using a local RPC wallet adapter.
The benchmark resets Anvil between paths, checks final principal and rejects
a transaction presented for a different quote. The synthetic merchant workloads
and measured results are in `bench/direct-checkout-results.md`. Raw receipts,
quotes and transaction inputs are emitted as a CI artifact. Random identifiers
can contain different numbers of zero bytes, causing small gas differences
between runs.

### Merchant feasibility screen

`node scripts/hub/bench-pilot.mjs --merchant-screen` measures shopper deposits,
joint clearing and merchant cash-outs. The report compares equivalent final
wallet balances with direct window settlement. Even assigning zero gas to
deployment, proofs and settlement, entry and exit exceed the entire 90%
budget for each tested merchant workload. Further settlement optimization
cannot close this gap while preserving the same entry and exit design.

Use `bench/merchant-screen-results.md` as a stop condition for this design.
A successor needs a different funding or execution model. Count its full
lifecycle cost and compare against direct payment on the same chain and
against Ethereum separately.

### Base fee comparison

Run `node scripts/hub/rollup-fees.mjs` after installing the locked Node dependencies.
The script uses read-only RPC on Ethereum and Base. Set `ETHEREUM_BLOCK=26343637`
and `BASE_BLOCK=53516138` to reproduce the committed sample at finalized blocks.
The report and raw public transaction receipts are in `bench/rollup-fees-results.*`.

The Base portal address comes from the chain 8453 entry in the
[Superchain Registry at commit 5b055be](https://github.com/ethereum-optimism/superchain-registry/blob/5b055be4d294ce43814a44c8839d89b2436dc8aa/superchain/extra/addresses/addresses.json).
The run checked for portal code on Ethereum and sampled its deposit event.
The historical Base fee breakdown adds receipt execution and data fees and the
[operator fee](https://specs.optimism.io/protocol/isthmus/predeploys.html#gaspriceoracle)
from the GasPriceOracle at each sample block. The checkout estimate uses a
read-only balance override and the oracle's upper bound for data fees.

The observed fee gap is relevant when shoppers and merchants already hold
spendable Base balances. A shopper who needs to enter from Ethereum must
include that expense. Only one native portal entry receipt matched the search
window, and no completed withdrawal flow was sampled. Use these figures as a
screen for the payment route, with separate accounting for entry and exit.

### Base Sepolia checkout

With the locked Node dependencies installed, set `CHECKOUT_PAYEE` to your
receiving testnet wallet and run:

```sh
CHECKOUT_PAYEE=0xYourTestnetWallet node network/checkout/server.mjs --base-sepolia
```

Open http://127.0.0.1:8080 in a browser with an Ethereum wallet. Get the
price and estimated total, then approve the payment. The page asks the
wallet to add or switch to Base Sepolia if needed, sends one payment and
polls for its receipt. A wallet without enough test ETH sees a funding
message before approval. The shopper can obtain test ETH separately and
request a new quote. The checkout has no bridge action.

The estimate combines execution, an oracle upper bound for L1 data, and
operator fees. The final wallet quote can change with network conditions.
The receipt displays the actual fee when the RPC returns the required
data. The server and wallet helper accept local Anvil and Base Sepolia
only. Base Sepolia network parameters are from the
[Base chain connection guide](https://docs.base.org/base-chain/quickstart/connecting-to-base).
Local checkout still runs with `node network/checkout/server.mjs`.

Live Base Sepolia verification covers read-only fee quotes. Local Anvil
covers actual payment receipts. Wallet behavior is tested using provider
stubs. Quote state remains in memory and the demo reports mined status
after one confirmation. Persistent merchant fulfillment and a finality
policy are still needed for production. The mainnet fee evidence remains
the separate sample in `bench/rollup-fees-results.md`.
