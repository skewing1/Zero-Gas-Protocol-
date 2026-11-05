//! Real SP1 RISC-V execution test runner. No proofs, chain calls, keys or gas claims.
use hub_kernel::batch::{apply_batch, state_root, BatchContext, BatchInput, SignedTransfer};
use hub_kernel::{asset_id, digest, hash, Address, Domain, State, Transfer};
use k256::ecdsa::SigningKey;
use sp1_core_executor::{Executor, Program};
use sp1_stark::SP1CoreOpts;

fn fixture() -> BatchInput {
    // Public deterministic local-test key; never used on a public network.
    let key = SigningKey::from_bytes((&[7u8; 32]).into()).unwrap();
    let digest_address = hash(&key.verifying_key().to_encoded_point(false).as_bytes()[1..]);
    let mut from: Address = [0; 20];
    from.copy_from_slice(&digest_address[12..]);
    let asset = asset_id(31338.into(), [0; 20]);
    let mut state = State::default();
    state.balances.insert((from, asset), 100.into());
    let context = BatchContext {
        domain: Domain {
            chain_id: 31337.into(),
            hub: [5; 20],
        },
        expected_old_root: state_root(&state).unwrap(),
        fee_recipient: [8; 20],
        batch_time: 50,
    };
    let transfers = [10u64, 5]
        .iter()
        .enumerate()
        .map(|(index, amount)| {
            let transfer = Transfer {
                from,
                to: [2; 20],
                asset_id: asset,
                amount: (*amount).into(),
                fee: 1.into(),
                fee_asset_id: asset,
                nonce: index.into(),
                deadline: 100,
                service_id: [3; 32],
                manifest_hash: [4; 32],
            };
            let (sig, id) = key
                .sign_prehash_recoverable(&digest(&context.domain, &transfer))
                .unwrap();
            let mut signature = sig.to_bytes().to_vec();
            signature.push(id.to_byte() + 27);
            SignedTransfer {
                transfer,
                signature,
            }
        })
        .collect();
    BatchInput {
        state,
        context,
        transfers,
    }
}
fn execute(elf: &[u8], input: &BatchInput) -> Result<(Vec<u8>, u64), String> {
    let program = Program::from(elf).map_err(|e| e.to_string())?;
    let mut runtime = Executor::new(program, SP1CoreOpts::default());
    runtime.max_cycles = Some(1_000_000_000); // Resource ceiling, not an expected cost.
    runtime.write_stdin(input);
    runtime.run_fast().map_err(|e| e.to_string())?;
    Ok((runtime.state.public_values_stream, runtime.state.global_clk))
}
fn main() {
    let path = std::env::args()
        .nth(1)
        .expect("Pass the freshly built hub-auth-program ELF path");
    let elf = std::fs::read(path).expect("Cannot read guest ELF");
    let input = fixture();
    let mut native = input.state.clone();
    let expected = apply_batch(&mut native, &input.context, &input.transfers)
        .unwrap()
        .abi_encode();
    let (actual, cycles) = execute(&elf, &input).expect("Valid batch must execute in SP1");
    assert_eq!(actual, expected, "Native and SP1 public values diverged");
    for case in 0..3 {
        let mut invalid = input.clone();
        match case {
            0 => invalid.state.balances.clear(),
            1 => invalid.transfers[1].signature[64] = 0,
            _ => invalid.context.batch_time = 101,
        }
        assert!(
            execute(&elf, &invalid).is_err(),
            "Invalid batch executed: {case}"
        );
    }
    let elf_hash = hash(&elf)
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect::<String>();
    println!("{{\"sp1Version\":\"5.2.4\",\"positiveCases\":1,\"negativeCases\":3,\"publicValuesMatch\":true,\"riscvCycles\":{cycles},\"elfKeccak256\":\"0x{elf_hash}\",\"proofGenerated\":false}}");
}
