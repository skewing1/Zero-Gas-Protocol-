# Network selection for transactors

The existing Ethereum/Base comparison was too narrow to select a network for
the whole platform. The first broader screen includes Ethereum, PulseChain,
Gnosis, Polygon PoS, BNB Smart Chain, Avalanche C-Chain, Celo, Base, OP Mainnet
and Arbitrum One. This is a shortlist, not an exhaustive EVM survey.

## Reproduce the screen

Install the repository's pinned Node dependencies, then run:

```sh
node scripts/hub/network-screen.mjs
```

Only five read-only RPC methods are allowed. The script has no signer and
cannot broadcast. Chain metadata comes from pinned viem 2.38.6; each RPC's
chain ID is checked. Override a public RPC with an environment variable such
as `PULSECHAIN_RPC_URL` or `POLYGON_RPC_URL`. Results and raw receipt evidence
are in `bench/network-screen.md` and `bench/network-screen.json.gz`.
Decompress the archive and reproduce the report without RPC access:

```sh
gzip -dc bench/network-screen.json.gz > /tmp/network-screen.json
node scripts/hub/network-screen.mjs --from-snapshot=/tmp/network-screen.json
```

The scanner targets eight plain native transfers in 24 recent finalized
blocks. It reports failures, missing finality tags, missing fee data and
smaller samples explicitly. Receipt-derived native amounts are measurements;
USD conversions use separately timestamped DefiLlama price quotes. Quote age
matters, especially for PLS. A sampled fee difference is not protocol-created
savings and is not a complete same-asset workflow comparison. Samples can be
clustered by exchanges or other participants; even eight observations are
not a representative long-term distribution.

## Candidate-specific checks

- PulseChain: official metadata identifies chain 369, PLS as the fee token,
  and `https://rpc.pulsechain.com`. One qualifying transfer was observed in
  the first bounded screen. That is insufficient for a savings conclusion.
  Bridge cost, asset provenance/liquidity, independent RPC confirmation,
  wallet support and current delegation compatibility remain unverified.
- Gnosis: fees use xDAI. The first sample contains unusually low effective
  gas prices; verify those against another provider and a broader period
  before presenting a typical user cost.
- Celo: the protocol supports gas payment in approved ERC-20 currencies.
  This could remove the need for transactors to acquire a separate gas
  token. The wallet must support CIP-64; a wallet may otherwise drop the
  fee-currency field. Stablecoin gas costs and supported wallets need a
  separate end-to-end test.
- OP Stack networks: execution alone omits L1 data and operator fees. The
  scanner requires these components and fails when it cannot obtain them.
- Arbitrum: posting cost is already included in receipt gas accounting;
  adding it again would double-count it.

## Adoption gate

A network qualifies only after an equivalent asset transfer is tested from
entry through spendable receipt and exit. Count bridge fees, swaps and
slippage, funding, relayer fees, account/delegation setup and withdrawals.
Compare both an already-funded transactor and one entering from Ethereum.
Check security/finality, asset backing, liquidity and wallet compatibility.
Current scanner results do not satisfy this gate for any new network.

The simple user flow remains recipient, asset, amount, review, approve.
A route is eligible only when the sender owns the required asset on that
chain and the recipient accepts it there. A copied token or address on
another chain does not establish asset equivalence. Cross-chain routing is
not implemented and must never silently move funds into another trust model.

## Primary sources checked

- https://gitlab.com/pulsechaincom/pulsechain-mainnet
- https://docs.gnosischain.com/about/networks/mainnet
- https://docs.celo.org/learn/network/overview
- https://docs.celo.org/build/fee-abstraction/overview
- https://docs.optimism.io/op-stack/transactions/fees
- https://docs.arbitrum.io/how-arbitrum-works/deep-dives/gas-and-fees
