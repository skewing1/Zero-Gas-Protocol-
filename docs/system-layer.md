# System layer v0

The user EOA delegates to the shared ProtocolAccount implementation. A wallet or agent signs a typed intent under that EOA's domain. Relayer nodes read the chain adapter configuration and submit batches to the shared Settler, which calls each delegated account. Transfers go from the payer's EOA to the payee and relayer.

The delegated code is a high-value phishing and attack surface. Verify its deployed bytecode and audit it before mainnet use. Some wallets restrict EIP-7702 delegation. Relayers are untrusted and replaceable. An intent becomes payment only after the account's IntentExecuted event reaches the chain's configured finality depth.

A user can spend funds through normal EOA transactions at any time. Revoking delegation prevents execution while it is revoked. Reattaching the same implementation may reactivate an unused, unexpired signature. Cancel the relevant nonce lane before revoking if those signatures must stay invalid after reattachment. The user pays the signed amount and a fee within the signed cap. The relayer fronts transaction gas. A user without native gas and without a live relayer needs another party to submit.

The accumulator covers successful executions submitted through the canonical Settler. Direct execution emits an account event and does not change the accumulator. Chain fee rules are outside this layer. Changing those rules would require control of the execution environment, such as an owned rollup.

## Run the local relayer

Start the pinned Anvil version in Prague mode and install the pinned Node dependencies with `npm --prefix node ci`. Build with `npm --prefix node run build`. Deploy the shared contracts using `script/Bench.s.sol:Bench` with the protocol flag enabled on the local chain.

The node config has a `chain` object matching `config/chains/anvil-local.json` with populated deployment addresses, plus `database`, `port`, `peers`, `maxBatchSize`, `maxWaitMs`, `pollMs`, and `replaceAfterMs`. An optional `host` defaults to loopback. Token intents require an explicit `assetWeiPerUnit` entry keyed by lowercase asset address. Those rates are local relayer policy. Set the configured RPC environment variable and `RELAYER_PRIVATE_KEY` in the relayer process.

```sh
node node/dist/cli.js start --config relayer.json
node node/dist/cli.js submit-intent intent.json --config relayer.json
node node/dist/cli.js status 0xINTENT_HASH --config relayer.json
node node/dist/cli.js ledger --summary --config relayer.json
```

An intent JSON has `account`, `intent`, and `sig` fields. Encode integer intent fields as decimal strings. The node currently offers the full signed fee cap and includes at most one intent per account and nonce lane in a batch. Keep the sqlite database and relayer signing key paired with a single running node. Different nodes racing for the same intents should use different relayer keys. Peer fan-out is best effort and local configuration controls which peers receive new intents.
