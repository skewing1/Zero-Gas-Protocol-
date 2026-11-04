# Read-only rollup payment fee screen

Historic mainnet receipts for plain ETH wallet transfers. Samples are the first eight eligible transfers from each finalized head and preceding blocks. This is a small observation window.
Base fees include execution and receipt L1 data fees plus the historical operator fee returned by the oracle. No transaction was broadcast for this screen.

| Chain | Finalized head | Sample size | Median total fee (wei) |
| --- | ---: | ---: | ---: |
| Ethereum | 26343637 | 8 | 2059364895000 |
| Base | 53516138 | 8 | 126891982899 |

Base direct transfer vs Ethereum direct transfer: **93.83% lower observed median fee**.
Same-chain Base plain-transfer baseline: **126891982899 wei**. The 90% target would require **12689198289 wei** per payment.
Base quote-linked checkout estimate at block 53516138: **131727982899 wei** (21806 estimated gas, historical execution price, oracle data fee upper bound and operator fee). The sampled plain transfer used 126891982899 wei. The checkout used a read-only balance override.
Checkout estimate versus sampled Ethereum median: **93.6% lower**. The budget below uses plain Base transfers.
Observed Ethereum-side Base portal deposit fee: **28127173086977 wei median** across 1 sampled native deposits. The deposits come from separate historical transactions.

| Purchases per user | Maximum combined entry/exit fees to keep 90% vs Ethereum (wei) | Exit budget after sampled entry fee (wei) |
| ---: | ---: | ---: |
| 1 | 79044506601 | -28048128580376 |
| 10 | 790445066010 | -27336728020967 |
| 100 | 7904450660100 | -20222722426877 |

Budgets use the sampled direct fees. A negative exit budget means the entry sample alone exceeds the remaining allowance. Actual withdrawal and any sponsor or merchant operating costs are unmeasured. Balances on Base and Ethereum have different exit requirements.
