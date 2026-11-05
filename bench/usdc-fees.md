# Same-asset direct USDC fee evidence

Read-only observation started 2026-11-05T19:09:33.567Z. Circle-issued USDC only. No public-network transaction was signed or sent. Target: three successful direct transfers per chain; at most 128 finalized blocks for Ethereum/Base and a 5,000-block token-log window for sparse Celo USDC-fee transfers; 180 seconds per chain.
Celo rows use USDC for gas. Their fees are reconciled from the sender’s actual token balance change minus the exact payment, excluding blocks with other USDC transfers involving that sender. Native balances before/after are retained. Ethereum and Base rows use receipt fees, including Base L1 data and operator charges.

| Network | Recipient token state | Samples | Median network fee | Approx. USD |
| --- | --- | ---: | ---: | ---: |
| Ethereum | zero-token-balance | 1 | 29320367801984 wei | $0.06577873 |
| Ethereum | existing-token-balance | 2 | 22433281344300 wei | $0.05032791 |
| Base | zero-token-balance | 1 | 387984414243 wei | $0.00087042 |
| Base | existing-token-balance | 2 | 1149478887865 wei | $0.00257880 |
| Celo | zero-token-balance | 1 | 3726 micro-USDC | $0.00372600 |
| Celo | existing-token-balance | 2 | 2343 micro-USDC | $0.00234300 |

- Ethereum: MEASURED. 
- Base: MEASURED. 
- Celo: MEASURED. 2/3 sampled senders had zero native CELO before and after the payment. Live SDK quote: SIMULATED.

ETH/USD quote timestamp: 2026-11-05T19:05:19.000Z.

USD for ETH-paid gas is a separately timestamped price conversion. USDC amounts are token units, not a guarantee of a dollar redemption rate. Samples are small and can be clustered; recipient storage states are separated.

This is an already-funded, same-asset payment route. Entry, swaps, bridges, exit and ongoing platform operating cost are unmeasured. Full lifecycle 90%/99% gates remain NOT MEASURED. The SDK is an unsigned quote builder; a real CIP-64 wallet flow has not been tested. No fees are subsidized in the reported receipt totals.

Sources: https://developers.circle.com/stablecoins/usdc-contract-addresses ; https://docs.celo.org/build/tools/contracts/fee-currencies ; https://docs.celo.org/operate/specification/transaction-fees ; https://docs.celo.org/build/fee-abstraction/using-fee-abstraction
