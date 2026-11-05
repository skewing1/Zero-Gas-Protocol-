# Read-only EVM network fee screen

Collected starting 2026-11-05T18:43:05.684Z. viem chain metadata: pinned 2.38.6. Target: eight successful plain native transfers per network, at most 24 blocks scanned. Partial medians are shown with INCOMPLETE status. No savings gate is evaluated by this screen. This is a bounded shortlist, not every EVM network.
No transactions were sent. Fee values come from historical receipts. USD amounts are approximate conversions using third-party price quotes; quote timestamps are retained. No positive cost is rounded to free or 100% savings. Small, potentially clustered samples do not establish typical fees. This is native-token transfer fee screening, not an equal-asset cross-chain workflow benchmark.

| Network | Sample count | Median network fee (base units) | Approx. USD | Status |
| --- | ---: | ---: | ---: | --- |
| Ethereum | 8 | 14507552934000 ETH base units | $0.03265139 | MEASURED |
| PulseChain | 1 | 9418740184617729000 PLS base units | $0.00005271 | INCOMPLETE |
| Gnosis | 8 | 703500 XDAI base units | $7.0354e-13 | MEASURED |
| Polygon | 0 | — POL base units | NOT MEASURED | INCOMPLETE |
| BNB Smart Chain | 8 | 1050000021000 BNB base units | $0.00072716 | MEASURED |
| Avalanche | 2 | 73507196280000 AVAX base units | $0.00060833 | INCOMPLETE |
| Celo | 1 | 4221000000000000 CELO base units | $0.00028396 | INCOMPLETE |
| Base | 7 | 132067113369 ETH base units | $0.00029724 | INCOMPLETE |
| OP Mainnet | 0 | — ETH base units | NOT MEASURED | INCOMPLETE |
| Arbitrum One | 0 | — ETH base units | NOT MEASURED | INCOMPLETE |

- Ethereum: RPC finalized tag; block 0x1921345. Price quote: 2026-11-05T18:44:25.000Z.
- PulseChain: RPC finalized tag; block 0x1aaf9b4; Only 1/8 comparable transfers in 24 blocks. Price quote: 2026-11-05T16:08:02.000Z.
- Gnosis: RPC finalized tag; block 0x2ed9d2e. Price quote: 2026-11-05T18:22:52.000Z.
- Polygon: head unavailable; block unavailable; HTTP 401. Price quote: 2026-11-05T18:44:25.000Z.
- BNB Smart Chain: RPC finalized tag; block 0x7dc2090. Price quote: 2026-11-05T18:44:25.000Z.
- Avalanche: RPC finalized tag; block 0x5ee8711; Only 2/8 comparable transfers in 24 blocks. Price quote: 2026-11-05T18:44:25.000Z.
- Celo: RPC finalized tag; block 0x4e33e67; Only 1/8 comparable transfers in 24 blocks. Price quote: 2026-11-05T18:44:25.000Z.
- Base: RPC finalized tag; block 0x3314fe7; Only 7/8 comparable transfers in 24 blocks. Price quote: 2026-11-05T18:44:25.000Z.
- OP Mainnet: RPC finalized tag; block 0x97c76dd; HTTP 403. Price quote: 2026-11-05T18:44:25.000Z.
- Arbitrum One: RPC finalized tag; block 0x1f165042; HTTP 403. Price quote: 2026-11-05T18:44:25.000Z.

Execution, L1 data and operator fees are included for supported OP Stack receipts; incomplete oracle data is a failure, never silently zero. Arbitrum receipt gas already includes posting costs. Other sampled EVM networks use receipt gasUsed × effectiveGasPrice.
Excluded: token transfers, stablecoin/native-token acquisition, bridge entry and exit, swaps/slippage, liquidity, identity, relayer overhead and protocol settlement. EIP-7702 support, wallet support and protocol bytecode compatibility are UNVERIFIED. Lower sampled network fees are not protocol-created savings or a deployment recommendation.

Sources: https://gitlab.com/pulsechaincom/pulsechain-mainnet ; https://docs.gnosischain.com/about/networks/mainnet ; https://docs.celo.org/learn/network/overview ; https://docs.optimism.io/op-stack/transactions/fees ; https://docs.arbitrum.io/how-arbitrum-works/deep-dives/gas-and-fees . Other endpoint metadata comes from the pinned viem chain definitions and is checked against eth_chainId.
