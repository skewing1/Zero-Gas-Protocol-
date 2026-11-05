# Low-fee USDC route: current implementation and evidence

A transactor who already holds USDC on Celo can pay another wallet and pay
the network fee in USDC. No separate native CELO balance is required by this
transaction type. This is an existing chain-level capability, exposed through
our shared quote module rather than a new custody contract or app-specific
contract. It inherits Celo's governance, oracle, sequencing and DA trust, and
Circle's USDC issuer, upgrade and freeze powers.

## What was actually observed

The historical scan in `bench/usdc-fees.md` records three successful direct
Circle-USDC transfers on Celo. Network charges were 2,343, 2,344 and 3,726
micro-USDC (0.002343–0.003726 USDC). Two senders had zero native CELO before
and after their payment. The third sender's native balance was unchanged.

Each fee is reconciled as:

`sender token balance before - sender token balance after - payment amount`

The scanner excludes blocks with other token transfers involving the sender
and requires an exact principal Transfer event. It records raw transactions,
receipts, related logs and before/after balances in `bench/usdc-fees.json.gz`.
Ethereum and Base USDC observations are classified by the recipient's prior
token balance. These are small, uncontrolled samples, not a lifecycle savings
or production-readiness test. ETH-denominated fees are separately converted
using a timestamped USD quote. No public-network transactions were sent.

A separate live RPC simulation from a real USDC holder with zero CELO
successfully estimated another transfer. See `bench/celo-usdc-live-quote.json`:
2,861 micro-USDC estimated fee; 6,909 micro-USDC maximum execution reserve;
10,000 micro-USDC configured cap. This is an estimate, not another payment
receipt. The reserve uses a 20% gas margin and a conservative fee-per-gas bound;
the transactor's signed transaction gas limit and maxFeePerGas enforce that
execution bound. Changes to additional fee mechanisms require a new model.

## Use the component

Install the pinned Node dependencies. No signing key is needed to quote:

```sh
node network/low-fee/quote-usdc.mjs \
  --chain=11142220 \
  --from=0xYourCeloSepoliaWallet \
  --to=0xRecipientCeloSepoliaWallet \
  --amount=1 \
  --max-fee=0.01
```

The sender must hold test USDC; the builder never injects simulated token
funding. It checks the RPC chain, token/adapter/oracle code, adapter underlying
token and token decimals. It asks the RPC to price gas in the USDC adapter,
checks amount plus the full reserved fee against the real token balance, and
refuses a quote exceeding the cap. All calculations use integers. Gas math
uses 18-decimal adapter units and rounds upward to 6-decimal USDC units.

The module also verifies that the current L1-data and operator fees are zero;
it refuses quotes if extra charges appear or their oracle is unavailable.
Testnet output is an unsigned CIP-64 transaction. The read-only RPC transport
blocks all signing and broadcast methods. Chain 42220 accepts read-only fee
queries but emits no executable mainnet transaction artifact. No mainnet key
handling or broadcasts are implemented.

`--verify-zero-native` additionally simulates with the sender's native balance
set to zero. This only removes native balance; it never adds token funding.
It is separately labeled simulation. A quote without this option uses the
sender's unchanged actual balances.

Quotes are snapshots. Refresh balance, nonce, fee model and prices before
signing. The wallet must support CIP-64. Generic MetaMask transaction requests
can drop the feeCurrency field; do not assume that connecting any EVM wallet
makes USDC-paid gas work. The actual signer integration is not implemented or
verified by these fixtures. SDK tests cover encoding, caps, units, missing
code, mismatched chains/assets, insufficient balances and read-only guards.

## Native transfer overhead removed

Ordinary ETH transfers now have empty calldata. The off-chain quote is tied
to the sender's nonce, recipient, amount, chain and quote window. A changed
wallet account or nonce requires another review. The verifier prevents one
transaction from being assigned to two quotes in the current server process.
It still needs durable storage and a finality/reorg policy for production.

All 800 reviewed transfers in the four local transactor workloads matched
their direct P0 execution cost. The benchmark asserts that equality and checks
final balances. This removes our demo's extra memo cost; it is not a saving
over a plain transfer on the same chain. The separate clearing pilot still
fails the 90% target on these workloads.

## Cost discipline

Paying gas in USDC is an onboarding option, not a gas-unit reduction. Celo
fee abstraction executes extra token fee handling and can cost more than a
normal USDC transfer whose gas is paid in CELO. It must not be presented as
the cheapest route for a transactor who already has native gas. The current
module quotes only the USDC-gas option; it does not choose the cheapest fee
currency. Native-gas funding/acquisition and transaction fees need comparison
before making it a platform default. No x402 facilitator fee is included in
these direct-transfer observations; adding x402 would require a separate
all-in benchmark.

## What is still required

- A real CIP-64 wallet test on Celo Sepolia, including receipt reconciliation.
- UI integration keeping recipient, amount and one total fee visible.
- Entry and exit measurements for a user starting with Ethereum USDC, including
  swaps/bridges, liquidity and all fees. No complete 90%/99% gate passes yet.
- Broader same-asset sampling across times, independent RPC confirmation and
  tests for fresh and existing recipients with matched transaction sizes.
- Durable records, finality handling and receiver consent to the chain/asset.

The platform can make this its low-fee default only for parties who accept
USDC on Celo and have funds there. It cannot spend an Ethereum balance at a
Celo fee. A copied token on PulseChain is not assumed equivalent to native
USDC; a trustworthy asset route there remains unverified.

## Sources checked 2026-11-05

- https://developers.circle.com/stablecoins/usdc-contract-addresses
- https://docs.celo.org/build/tools/contracts/fee-currencies
- https://docs.celo.org/build/fee-abstraction/using-fee-abstraction
- https://docs.celo.org/build/fee-abstraction/overview
- https://docs.celo.org/operate/specification/transaction-fees
- https://docs.celo.org/operate/specification/fee-abstraction

Mainnet and Celo Sepolia USDC/token adapter addresses in the module match the
current Circle and Celo documentation. The live quote checks the mainnet
adapter's underlying token on-chain. Testnet signer interoperability remains
unverified; a passing mock quote is not presented as a testnet transfer.
