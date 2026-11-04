#![no_main]
sp1_zkvm::entrypoint!(main);
use hub_kernel::{digest, Address, Domain, State, Transfer};
pub fn main() {
    // Authentication-kernel smoke program, NOT a hub batch proof. State,
    // fee recipient and time are witness inputs, not yet authenticated by roots.
    let (mut state, domain, transfer, sig, recipient, now): (
        State,
        Domain,
        Transfer,
        Vec<u8>,
        Address,
        u64,
    ) = sp1_zkvm::io::read();
    state
        .apply(&domain, &transfer, &sig, recipient, now)
        .expect("invalid transfer");
    sp1_zkvm::io::commit_slice(&digest(&domain, &transfer));
    sp1_zkvm::io::commit(&state);
}
