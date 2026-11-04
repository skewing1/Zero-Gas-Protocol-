# Receipt anchoring

Settlement transfers value on its source chain. Anchoring commits a root of settlement receipts to Ethereum. It does not transfer assets. Each indexed Settler execution can be part of an anchor. A direct ProtocolAccount execution is a valid source-chain payment and is outside the anchor stream.

Pin the verifier address when verifying a proof. The registry is permissionless and an unknown verifier can accept arbitrary roots. A Merkle proof establishes membership in the selected anchored root. Source receipt authenticity depends on the selected verifier.

| Verifier | Trust and failure behavior |
| --- | --- |
| AttesterVerifier | A fixed threshold of bonded signers attests the root and source block. A dishonest threshold can forge a checkpoint. Equivocation can be slashed while a signer still has a bond. A missing quorum delays anchoring while source payments remain usable. |
| MockCanonicalVerifier | Simulation only. Anyone can announce an arbitrary root. A timer tests delayed availability and supplies no source-chain security. |
