#![no_main]
sp1_zkvm::entrypoint!(main);
use hub_kernel::batch::{apply_batch, BatchInput};
pub fn main() {
    // Root-bound transition prototype. No settlement contract consumes this ELF.
    // Chain authentication, deposits, exits and data availability remain absent.
    let mut input: BatchInput = sp1_zkvm::io::read();
    let public =
        apply_batch(&mut input.state, &input.context, &input.transfers).expect("invalid batch");
    sp1_zkvm::io::commit_slice(&public.abi_encode());
}
