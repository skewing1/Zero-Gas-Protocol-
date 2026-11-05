# x402 is optional payment transport, not a gas-saving claim

x402 can carry a transactor's signed payment authorization through HTTP.
In the EVM exact/EIP-3009 flow, a facilitator broadcasts the transfer and pays
the network gas. The transactor still pays the service amount. A facilitator
may subsidize gas or recover it through its business terms; its fee policy
must be verified separately. Moving gas to another payer does not reduce the
system's cost, and additional execution or facilitator charges can increase it.

For this project, x402 must not be added to the core route as a savings
mechanism. Its adoption needs a measured comparison with a direct transfer
of the same asset on the same chain, with the same completed service outcome.
Count gas from every payer, facilitator charges, setup and entry/exit costs.
Record the user-paid share separately from total cost. No SDK integration or
x402 settlement benchmark is implemented in this branch.

Services may sell access for a bounded period or bundle, and authorize later
requests off-chain after the payment settles. V2 supports reusable-access
patterns. That reduces the number of required settlements only when the
service actually accepts those terms. The fair baseline is a direct payment
for that same period or bundle, not a transaction for every HTTP request.
Cached access is service entitlement, not a circulating token, escrow balance
or promise that an unsettled authorization is already paid.

Browsing, discovery and routine message delivery need no payment transaction
unless a participant chooses to charge for that service. Access validation
can use signed records and cached proof of a finalized payment. None of this
removes the cost of transfers that genuinely must settle independently.

The current development priorities are ordinary direct transactions without
added calldata and measured low-fee networks. USDC-paid gas on Celo is a
convenience option; it can use more gas than paying that chain's fee in CELO.
Neither x402 nor native fee abstraction is counted as protocol-created savings.

Primary sources checked 2026-11-05:

- https://github.com/x402-foundation/x402/blob/main/specs/schemes/exact/scheme_exact_evm.md
- https://x402.org/x402-v2-launch/
- https://docs.celo.org/operate/specification/fee-abstraction

The Celo facilitator's public /supported endpoint was queried without any
signature or settlement request. Advertising support is not evidence of
settlement cost, facilitator pricing, independence or reliability. No
/settle request or signed payment was sent.
