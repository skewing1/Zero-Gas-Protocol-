# Shared settlement contracts

Deploy one ProtocolAccount and one Settler bound to that implementation per chain. Applications should agree on the deployment addresses and verify the runtime code before asking users to delegate. The repository ships an unconfigured local chain adapter in `config/chains/anvil-local.json`.
