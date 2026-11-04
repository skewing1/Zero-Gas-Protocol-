# Universal Near-Zero Gas Protocol

Sinister Rabbit is an alternative internet platform with Ethereum and EVM settlement. See [protocol architecture](docs/protocol-architecture.md) for the system design.

## Receipt-based payout benchmarks

Use Foundry v1.3.1 and Node.js v20.19.4. Install the pinned Solidity test dependency and run the unit tests:

```sh
forge install foundry-rs/forge-std@v1.9.7 --no-git
forge install OpenZeppelin/openzeppelin-contracts@v5.0.2 --no-git
forge build
forge test -vv
node --test scripts/validate-workload.mjs
```

Run `npm --prefix node ci` to install the pinned benchmark dependencies.

Start a dedicated local Anvil node, then run the benchmark in another terminal:

```sh
anvil --chain-id 31337 --hardfork prague --steps-tracing --mnemonic 'test test test test test test test test test test test junk' &
node scripts/bench.mjs
```

The benchmark writes `bench/results.json` with the individual receipts and `bench/results.md` with the comparison tables. CI publishes both as artifacts. Use a fresh Anvil process with the public test mnemonic. Each path starts from the same chain snapshot and must deliver the same final recipient balances for that workload and asset.

W1 uses 100 fresh recipients, W2 uses 100 recipients prefunded with one unit of the benchmark asset, W3 uses 25 recipients, and W4 uses 10. Each workload contains 100 obligations. P0 sends them separately, P1 pays them in a single push batch, P1-net combines obligations to the same recipient before pushing, and P2 publishes a native payout commitment and submits each claim separately from a relayer account.

Totals include token approval when required. Deployment fees are reported separately and amortized over the 100 original obligations. Prefunding is setup and excluded from totals. Blocks to spendable counts Anvil automined blocks after setup. The benchmark uses a fixed local gas price and reports L1 data fees when present in a receipt. Fees exclude signature verification, sponsorship and ERC-4337 overhead, cross-chain settlement, blob fees, and off-chain operating costs.

The Foundry unit tests also print in-transaction execution gas for diagnostics. Use the receipt report for transaction cost comparisons.
