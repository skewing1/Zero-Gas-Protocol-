# System layer v0

The user EOA delegates to the shared ProtocolAccount implementation. A wallet or agent signs a typed intent under that EOA's domain. Relayer nodes read the chain adapter configuration and submit batches to the shared Settler, which calls each delegated account. Transfers go from the payer's EOA to the payee and relayer.

The delegated code is a high-value phishing and attack surface. Verify its deployed bytecode and audit it before mainnet use. Some wallets restrict EIP-7702 delegation. Relayers are untrusted and replaceable. An intent becomes payment only after the account's IntentExecuted event reaches the chain's configured finality depth.

A user can spend funds through normal EOA transactions at any time. Revoking delegation prevents execution while it is revoked. Reattaching the same implementation may reactivate an unused, unexpired signature. Cancel the relevant nonce lane before revoking if those signatures must stay invalid after reattachment. The user pays the signed amount and a fee within the signed cap. The relayer fronts transaction gas. A user without native gas and without a live relayer needs another party to submit.

The accumulator covers successful executions submitted through the canonical Settler. Direct execution emits an account event and does not change the accumulator. Chain fee rules are outside this layer. Changing those rules would require control of the execution environment, such as an owned rollup.
