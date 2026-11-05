//! Complete-state commitment prototype. Full-state witnesses are required; no storage
//! proof, deposit import, blob binding, exit or settlement contract is implied.
use super::{address_word, digest, hash, word, Address, Domain, Hash, State, Transfer};
use primitive_types::U256;
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};

pub const TREE_DEPTH: usize = 32;
pub const MAX_BATCH_TRANSFERS: usize = 10_000;
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct SignedTransfer {
    pub transfer: Transfer,
    pub signature: Vec<u8>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct BatchContext {
    pub domain: Domain,
    pub expected_old_root: Hash,
    pub fee_recipient: Address,
    pub batch_time: u64,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct BatchInput {
    pub state: State,
    pub context: BatchContext,
    pub transfers: Vec<SignedTransfer>,
}
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct BatchPublicValues {
    pub old_root: Hash,
    pub new_root: Hash,
    pub domain: Domain,
    pub fee_recipient: Address,
    pub batch_time: u64,
    pub min_deadline: u64,
    pub receipts_root: Hash,
    pub transfer_count: u32,
}
impl BatchPublicValues {
    /// ABI tuple: uint32 version, bytes32 oldRoot, bytes32 newRoot,
    /// uint256 chainId, address hub, address feeRecipient, uint64 batchTime,
    /// uint64 minDeadline, bytes32 receiptsRoot, uint32 transferCount.
    pub fn abi_encode(&self) -> Vec<u8> {
        [
            word(1.into()),
            self.old_root,
            self.new_root,
            word(self.domain.chain_id),
            address_word(self.domain.hub),
            address_word(self.fee_recipient),
            word(self.batch_time.into()),
            word(self.min_deadline.into()),
            self.receipts_root,
            word(self.transfer_count.into()),
        ]
        .concat()
    }
}
fn pair(tag: u8, left: Hash, right: Hash) -> Hash {
    hash(&[&[tag][..], &left, &right].concat())
}
fn len32(len: usize) -> Result<[u8; 4], &'static str> {
    Ok(u32::try_from(len)
        .map_err(|_| "commitment length")?
        .to_be_bytes())
}

/// Depth-32 sparse tree. The full hashed key is included in a sorted collision
/// bucket. Distinct accounts sharing a 32-bit path can never overwrite each other.
fn sparse_root(entries: Vec<(Hash, Hash)>) -> Result<Hash, &'static str> {
    let mut buckets: BTreeMap<u32, Vec<(Hash, Hash)>> = BTreeMap::new();
    for (key, value) in entries {
        let index = u32::from_be_bytes(key[..4].try_into().unwrap());
        buckets.entry(index).or_default().push((key, value));
    }
    let mut nodes = BTreeMap::new();
    for (index, mut bucket) in buckets {
        bucket.sort_by_key(|(key, _)| *key);
        if bucket.windows(2).any(|w| w[0].0 == w[1].0) {
            return Err("duplicate account key");
        }
        let mut bytes = vec![2u8];
        bytes.extend_from_slice(&len32(bucket.len())?);
        for (key, value) in bucket {
            bytes.extend_from_slice(&key);
            bytes.extend_from_slice(&value);
        }
        nodes.insert(index, hash(&bytes));
    }
    let mut empty = hash(&[0]);
    for _ in 0..TREE_DEPTH {
        let parents: BTreeSet<u32> = nodes.keys().map(|index| index >> 1).collect();
        let mut next = BTreeMap::new();
        for parent in parents {
            let left = nodes.get(&(parent << 1)).copied().unwrap_or(empty);
            let right = nodes.get(&((parent << 1) | 1)).copied().unwrap_or(empty);
            next.insert(parent, pair(1, left, right));
        }
        nodes = next;
        empty = pair(1, empty, empty);
    }
    Ok(nodes.get(&0).copied().unwrap_or(empty))
}

/// Commits every nonzero account balance and nonce, and all frozen asset IDs.
/// Zero map entries normalize to absence; account/asset order is canonical.
pub fn state_root(state: &State) -> Result<Hash, &'static str> {
    let mut accounts: BTreeMap<Address, (U256, BTreeMap<Hash, U256>)> = BTreeMap::new();
    for (&owner, &nonce) in &state.nonces {
        if !nonce.is_zero() {
            accounts.entry(owner).or_default().0 = nonce;
        }
    }
    for (&(owner, asset), &amount) in &state.balances {
        if !amount.is_zero() {
            accounts.entry(owner).or_default().1.insert(asset, amount);
        }
    }
    let mut entries = Vec::with_capacity(accounts.len());
    for (owner, (nonce, balances)) in accounts {
        let key = hash(&[&[16u8][..], &owner].concat());
        let mut leaf = vec![17u8];
        leaf.extend_from_slice(&owner);
        leaf.extend_from_slice(&word(nonce));
        leaf.extend_from_slice(&len32(balances.len())?);
        for (asset, amount) in balances {
            leaf.extend_from_slice(&asset);
            leaf.extend_from_slice(&word(amount));
        }
        entries.push((key, hash(&leaf)));
    }
    let mut frozen = vec![7u8];
    frozen.extend_from_slice(&len32(state.frozen_assets.len())?);
    for asset in &state.frozen_assets {
        frozen.extend_from_slice(asset);
    }
    Ok(pair(3, sparse_root(entries)?, hash(&frozen)))
}
fn receipts_root(context: &BatchContext, transfers: &[SignedTransfer]) -> Hash {
    let context_hash = hash(
        &[
            &[8u8][..],
            &context.expected_old_root,
            &word(context.domain.chain_id),
            &context.domain.hub,
            &context.fee_recipient,
            &context.batch_time.to_be_bytes(),
        ]
        .concat(),
    );
    let mut leaves: Vec<Hash> = transfers
        .iter()
        .enumerate()
        .map(|(index, signed)| {
            hash(
                &[
                    &[4u8][..],
                    &context_hash,
                    &(index as u32).to_be_bytes(),
                    &digest(&context.domain, &signed.transfer),
                ]
                .concat(),
            )
        })
        .collect();
    leaves.resize(leaves.len().next_power_of_two(), hash(&[5]));
    while leaves.len() > 1 {
        leaves = leaves
            .chunks_exact(2)
            .map(|p| pair(6, p[0], p[1]))
            .collect();
    }
    leaves[0]
}

/// Atomic transition from the publicly declared old root. A future settlement
/// contract MUST compare that root/domain/deadlines to its own canonical state.
/// Returning these values alone does not authenticate them to an actual chain.
pub fn apply_batch(
    state: &mut State,
    context: &BatchContext,
    transfers: &[SignedTransfer],
) -> Result<BatchPublicValues, &'static str> {
    if transfers.is_empty() || transfers.len() > MAX_BATCH_TRANSFERS {
        return Err("batch size");
    }
    if context.domain.chain_id.is_zero()
        || context.domain.hub == [0; 20]
        || context.fee_recipient == [0; 20]
    {
        return Err("batch context");
    }
    if state_root(state)? != context.expected_old_root {
        return Err("old root");
    }
    // One copy per batch, rather than copying the entire map per transfer.
    let mut next = state.clone();
    let mut min_deadline = u64::MAX;
    for signed in transfers {
        next.apply_in_place(
            &context.domain,
            &signed.transfer,
            &signed.signature,
            context.fee_recipient,
            context.batch_time,
        )?;
        min_deadline = min_deadline.min(signed.transfer.deadline);
    }
    let public = BatchPublicValues {
        old_root: context.expected_old_root,
        new_root: state_root(&next)?,
        domain: context.domain.clone(),
        fee_recipient: context.fee_recipient,
        batch_time: context.batch_time,
        min_deadline,
        receipts_root: receipts_root(context, transfers),
        transfer_count: transfers.len() as u32,
    };
    *state = next;
    Ok(public)
}

#[cfg(test)]
mod tests {
    use super::*;
    use k256::ecdsa::SigningKey;
    fn key(seed: u8) -> (SigningKey, Address) {
        let key = SigningKey::from_bytes((&[seed; 32]).into()).unwrap();
        let h = hash(&key.verifying_key().to_encoded_point(false).as_bytes()[1..]);
        let mut address = [0; 20];
        address.copy_from_slice(&h[12..]);
        (key, address)
    }
    fn sign(key: &SigningKey, domain: &Domain, transfer: Transfer) -> SignedTransfer {
        let (sig, id) = key
            .sign_prehash_recoverable(&digest(domain, &transfer))
            .unwrap();
        let mut signature = sig.to_bytes().to_vec();
        signature.push(id.to_byte() + 27);
        SignedTransfer {
            transfer,
            signature,
        }
    }
    fn fixture() -> (State, BatchContext, Vec<SignedTransfer>) {
        let (key, from) = key(7);
        let asset = super::super::asset_id(31338.into(), [0; 20]);
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
        let transfer = Transfer {
            from,
            to: [2; 20],
            asset_id: asset,
            amount: 10.into(),
            fee: 1.into(),
            fee_asset_id: asset,
            nonce: 0.into(),
            deadline: 100,
            service_id: [3; 32],
            manifest_hash: [4; 32],
        };
        let first = sign(&key, &context.domain, transfer.clone());
        let mut second = transfer;
        second.amount = 5.into();
        second.nonce = 1.into();
        (
            state,
            context.clone(),
            vec![first, sign(&key, &context.domain, second)],
        )
    }
    fn display(hash: &[u8]) -> String {
        format!(
            "0x{}",
            hash.iter().map(|b| format!("{b:02x}")).collect::<String>()
        )
    }
    fn vector(name: &str) -> &'static str {
        include_str!("../vectors/batch-roots.txt")
            .lines()
            .filter_map(|line| line.split_once('='))
            .find(|(key, _)| *key == name)
            .unwrap()
            .1
    }
    #[test]
    fn batch_matches_single_execution_and_conserves_assets() {
        let (mut state, context, transfers) = fixture();
        let mut direct = state.clone();
        for t in &transfers {
            direct
                .apply(
                    &context.domain,
                    &t.transfer,
                    &t.signature,
                    context.fee_recipient,
                    context.batch_time,
                )
                .unwrap();
        }
        let out = apply_batch(&mut state, &context, &transfers).unwrap();
        assert_eq!(state, direct);
        assert_eq!(
            state.balances[&(transfers[0].transfer.from, transfers[0].transfer.asset_id)],
            83.into()
        );
        assert_eq!(
            state
                .balances
                .values()
                .fold(U256::zero(), |sum, amount| sum + amount),
            100.into()
        );
        assert_eq!(out.transfer_count, 2);
        assert_eq!(out.min_deadline, 100);
        assert_eq!(out.new_root, state_root(&state).unwrap());
        assert_ne!(out.old_root, out.new_root);
    }
    #[test]
    fn forged_or_incomplete_old_state_fails_before_execution() {
        for remove in [false, true] {
            let (mut state, context, transfers) = fixture();
            if remove {
                state.balances.clear();
            } else {
                state.balances.insert(
                    (transfers[0].transfer.from, transfers[0].transfer.asset_id),
                    1000.into(),
                );
            }
            let before = state.clone();
            assert_eq!(
                apply_batch(&mut state, &context, &transfers),
                Err("old root")
            );
            assert_eq!(state, before);
        }
    }
    #[test]
    fn late_failure_does_not_commit_a_valid_prefix() {
        for case in 0..4 {
            let (mut state, context, mut transfers) = fixture();
            let before = state.clone();
            match case {
                0 => transfers[1].transfer.nonce = 0.into(),
                1 => transfers[1].signature[64] = 0,
                2 => transfers[1].transfer.amount = 200.into(),
                _ => transfers[1].transfer.deadline = 49,
            }
            assert!(apply_batch(&mut state, &context, &transfers).is_err());
            assert_eq!(state, before);
        }
    }
    #[test]
    fn replay_and_domain_substitution_fail() {
        let (mut state, mut context, transfers) = fixture();
        let out = apply_batch(&mut state, &context, &transfers).unwrap();
        context.expected_old_root = out.new_root;
        assert_eq!(apply_batch(&mut state, &context, &transfers), Err("nonce"));
        let (mut state, mut context, transfers) = fixture();
        context.domain.chain_id = 31338.into();
        assert_eq!(apply_batch(&mut state, &context, &transfers), Err("signer"));
    }
    #[test]
    fn roots_cover_nonces_assets_balances_and_frozen_status() {
        let (state, _, transfers) = fixture();
        let original = state_root(&state).unwrap();
        for case in 0..4 {
            let mut changed = state.clone();
            let t = &transfers[0].transfer;
            match case {
                0 => {
                    changed.nonces.insert(t.from, 1.into());
                }
                1 => {
                    changed.balances.insert((t.from, [9; 32]), 1.into());
                }
                2 => {
                    changed.balances.insert((t.from, t.asset_id), 99.into());
                }
                _ => {
                    changed.frozen_assets.insert(t.asset_id);
                }
            }
            assert_ne!(state_root(&changed).unwrap(), original);
        }
        let mut frozen = state.clone();
        frozen.frozen_assets.insert(transfers[0].transfer.asset_id);
        let mut context = fixture().1;
        context.expected_old_root = state_root(&frozen).unwrap();
        assert_eq!(
            apply_batch(&mut frozen, &context, &transfers),
            Err("frozen asset")
        );
    }
    #[test]
    fn roots_normalize_zero_entries_and_map_insertion_order() {
        let (state, _, _) = fixture();
        let mut changed = state.clone();
        changed.balances.insert(([9; 20], [9; 32]), U256::zero());
        changed.nonces.insert([9; 20], U256::zero());
        assert_eq!(state_root(&changed), state_root(&state));
        let mut reordered = State::default();
        for (&key, &value) in changed.balances.iter().rev() {
            reordered.balances.insert(key, value);
        }
        reordered.nonces = changed.nonces;
        assert_eq!(state_root(&reordered), state_root(&state));
    }
    #[test]
    fn colliding_paths_preserve_both_keys_and_reject_duplicate_keys() {
        let mut a = [0; 32];
        a[..4].copy_from_slice(&[0x12, 0x34, 0x56, 0x78]);
        let mut b = a;
        b[31] = 1;
        let both = sparse_root(vec![(a, [1; 32]), (b, [2; 32])]).unwrap();
        assert_ne!(both, sparse_root(vec![(a, [1; 32])]).unwrap());
        assert_eq!(both, sparse_root(vec![(b, [2; 32]), (a, [1; 32])]).unwrap());
        assert_eq!(
            sparse_root(vec![(a, [1; 32]), (a, [2; 32])]),
            Err("duplicate account key")
        );
        assert_eq!(display(&both), vector("collisionRoot"));
    }
    #[test]
    fn receipts_commit_order_and_fee_recipient() {
        let (mut state, context, transfers) = fixture();
        let (key, from) = key(9);
        let mut independent = transfers[0].transfer.clone();
        independent.from = from;
        state
            .balances
            .insert((from, independent.asset_id), 100.into());
        let other = sign(&key, &context.domain, independent);
        let mut context = context;
        context.expected_old_root = state_root(&state).unwrap();
        let forward = [transfers[0].clone(), other.clone()];
        let reverse = [other, transfers[0].clone()];
        let mut a = state.clone();
        let mut b = state;
        let first = apply_batch(&mut a, &context, &forward).unwrap();
        let second = apply_batch(&mut b, &context, &reverse).unwrap();
        assert_eq!(first.new_root, second.new_root);
        assert_ne!(first.receipts_root, second.receipts_root);
        let mut changed = context.clone();
        changed.fee_recipient = [6; 20];
        assert_ne!(
            receipts_root(&changed, &forward),
            receipts_root(&context, &forward)
        );
    }
    #[test]
    fn empty_batch_and_invalid_context_do_not_mutate_state() {
        let (mut state, mut context, transfers) = fixture();
        let before = state.clone();
        assert_eq!(apply_batch(&mut state, &context, &[]), Err("batch size"));
        context.domain.chain_id = U256::zero();
        assert_eq!(
            apply_batch(&mut state, &context, &transfers),
            Err("batch context")
        );
        assert_eq!(state, before);
    }
    #[test]
    fn per_origin_fee_asset_accounting_stays_separate() {
        let (mut state, mut context, transfers) = fixture();
        let (key, from) = key(7);
        let other = super::super::asset_id(31339.into(), [0; 20]);
        state.balances.insert((from, other), 10.into());
        context.expected_old_root = state_root(&state).unwrap();
        let changed: Vec<_> = transfers
            .into_iter()
            .map(|signed| {
                let mut t = signed.transfer;
                t.fee_asset_id = other;
                sign(&key, &context.domain, t)
            })
            .collect();
        apply_batch(&mut state, &context, &changed).unwrap();
        assert_eq!(
            state.balances[&(from, changed[0].transfer.asset_id)],
            85.into()
        );
        assert_eq!(state.balances[&(from, other)], 8.into());
        assert_eq!(state.balances[&(context.fee_recipient, other)], 2.into());
        assert_eq!(
            state.balances[&(changed[0].transfer.to, changed[0].transfer.asset_id)],
            15.into()
        );
    }
    #[test]
    fn oversized_batch_is_rejected_without_state_changes() {
        let (mut state, context, transfers) = fixture();
        let before = state.clone();
        let too_large = vec![transfers[0].clone(); MAX_BATCH_TRANSFERS + 1];
        assert_eq!(
            apply_batch(&mut state, &context, &too_large),
            Err("batch size")
        );
        assert_eq!(state, before);
    }
    #[test]
    fn independent_viem_roots_receipts_and_abi_vector() {
        let (mut state, context, transfers) = fixture();
        assert_eq!(display(&state_root(&state).unwrap()), vector("oldRoot"));
        let out = apply_batch(&mut state, &context, &transfers).unwrap();
        assert_eq!(display(&out.new_root), vector("newRoot"));
        assert_eq!(display(&out.receipts_root), vector("receiptsRoot"));
        assert_eq!(display(&out.abi_encode()), vector("publicValues"));
        assert_eq!(out.abi_encode().len(), 10 * 32);
    }
}
