//! Signed transfers and root-bound batch transitions. Settlement, evidence and DA are not implemented.
pub mod batch;
use k256::ecdsa::{RecoveryId, Signature, VerifyingKey};
use primitive_types::U256;
use serde::{Deserialize, Serialize};
use sha3::{Digest, Keccak256};
use std::collections::{BTreeMap, BTreeSet};
pub type Address = [u8; 20];
pub type Hash = [u8; 32];
pub fn hash(data: &[u8]) -> Hash {
    Keccak256::digest(data).into()
}
fn word(x: U256) -> Hash {
    let mut b = [0; 32];
    x.to_big_endian(&mut b);
    b
}
fn address_word(a: Address) -> Hash {
    let mut b = [0; 32];
    b[12..].copy_from_slice(&a);
    b
}
fn words(xs: &[Hash]) -> Hash {
    hash(&xs.concat())
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Transfer {
    pub from: Address,
    pub to: Address,
    pub asset_id: Hash,
    pub amount: U256,
    pub fee: U256,
    pub fee_asset_id: Hash,
    pub nonce: U256,
    pub deadline: u64,
    pub service_id: Hash,
    pub manifest_hash: Hash,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Domain {
    pub chain_id: U256,
    pub hub: Address,
}
pub fn digest(d: &Domain, t: &Transfer) -> Hash {
    let domain = words(&[
        hash(b"EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
        hash(b"ZeroGasHub"),
        hash(b"1"),
        word(d.chain_id),
        address_word(d.hub),
    ]);
    let intent=words(&[hash(b"HubTransfer(address from,address to,bytes32 assetId,uint256 amount,uint256 fee,bytes32 feeAssetId,uint256 nonce,uint64 deadline,bytes32 serviceId,bytes32 manifestHash)"),address_word(t.from),address_word(t.to),t.asset_id,word(t.amount),word(t.fee),t.fee_asset_id,word(t.nonce),word(t.deadline.into()),t.service_id,t.manifest_hash]);
    hash(&[&[0x19, 0x01][..], &domain, &intent].concat())
}
pub fn asset_id(origin: U256, token: Address) -> Hash {
    words(&[word(origin), address_word(token)])
}
pub fn signer(digest: Hash, sig: &[u8]) -> Result<Address, &'static str> {
    if sig.len() != 65 {
        return Err("signature length");
    }
    let s = Signature::from_slice(&sig[..64]).map_err(|_| "signature")?;
    if s.normalize_s().is_some() {
        return Err("high s");
    }
    let v = match sig[64] {
        27 | 28 => sig[64] - 27,
        _ => return Err("recovery id"),
    };
    let key = VerifyingKey::recover_from_prehash(
        &digest,
        &s,
        RecoveryId::from_byte(v).ok_or("recovery id")?,
    )
    .map_err(|_| "recovery")?;
    let h = hash(&key.to_encoded_point(false).as_bytes()[1..]);
    let mut a = [0; 20];
    a.copy_from_slice(&h[12..]);
    Ok(a)
}
#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct State {
    pub balances: BTreeMap<(Address, Hash), U256>,
    pub nonces: BTreeMap<Address, U256>,
    pub frozen_assets: BTreeSet<Hash>,
}
impl State {
    fn debit(&mut self, a: Address, asset: Hash, value: U256) -> Result<(), &'static str> {
        let old = self.balances.get(&(a, asset)).copied().unwrap_or_default();
        self.balances
            .insert((a, asset), old.checked_sub(value).ok_or("balance")?);
        Ok(())
    }
    fn credit(&mut self, a: Address, asset: Hash, value: U256) -> Result<(), &'static str> {
        let old = self.balances.get(&(a, asset)).copied().unwrap_or_default();
        self.balances
            .insert((a, asset), old.checked_add(value).ok_or("overflow")?);
        Ok(())
    }
    pub fn apply(
        &mut self,
        d: &Domain,
        t: &Transfer,
        sig: &[u8],
        fee_recipient: Address,
        now: u64,
    ) -> Result<(), &'static str> {
        let mut next = self.clone();
        next.apply_in_place(d, t, sig, fee_recipient, now)?;
        *self = next;
        Ok(())
    }

    // Caller owns rollback: public single-transfer and batch APIs use a private copy.
    fn apply_in_place(
        &mut self,
        d: &Domain,
        t: &Transfer,
        sig: &[u8],
        fee_recipient: Address,
        now: u64,
    ) -> Result<(), &'static str> {
        if now > t.deadline {
            return Err("expired");
        }
        if t.to == [0; 20] || fee_recipient == [0; 20] {
            return Err("zero destination");
        }
        if self.frozen_assets.contains(&t.asset_id)
            || (!t.fee.is_zero() && self.frozen_assets.contains(&t.fee_asset_id))
        {
            return Err("frozen asset");
        }
        let nonce = self.nonces.get(&t.from).copied().unwrap_or_default();
        if nonce != t.nonce {
            return Err("nonce");
        }
        if signer(digest(d, t), sig)? != t.from {
            return Err("signer");
        }
        self.debit(t.from, t.asset_id, t.amount)?;
        self.debit(t.from, t.fee_asset_id, t.fee)?;
        self.credit(t.to, t.asset_id, t.amount)?;
        self.credit(fee_recipient, t.fee_asset_id, t.fee)?;
        self.nonces.insert(
            t.from,
            nonce.checked_add(U256::one()).ok_or("nonce overflow")?,
        );
        Ok(())
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    use k256::ecdsa::SigningKey;
    fn fixture() -> (State, Domain, Transfer, Vec<u8>) {
        let key = SigningKey::from_bytes((&[7u8; 32]).into()).unwrap();
        let h = hash(&key.verifying_key().to_encoded_point(false).as_bytes()[1..]);
        let mut from = [0; 20];
        from.copy_from_slice(&h[12..]);
        let asset = asset_id(31338.into(), [0; 20]);
        let t = Transfer {
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
        let d = Domain {
            chain_id: 31337.into(),
            hub: [5; 20],
        };
        let (sig, id) = key.sign_prehash_recoverable(&digest(&d, &t)).unwrap();
        let mut bytes = sig.to_bytes().to_vec();
        bytes.push(id.to_byte() + 27);
        let mut s = State::default();
        s.balances.insert((from, asset), 100.into());
        (s, d, t, bytes)
    }
    #[test]
    fn balances_fees_and_replay() {
        let (mut s, d, t, sig) = fixture();
        s.apply(&d, &t, &sig, [8; 20], 100).unwrap();
        assert_eq!(s.balances[&(t.from, t.asset_id)], 89.into());
        assert_eq!(s.balances[&(t.to, t.asset_id)], 10.into());
        assert_eq!(s.balances[&([8; 20], t.asset_id)], 1.into());
        assert_eq!(s.apply(&d, &t, &sig, [8; 20], 100), Err("nonce"));
    }
    #[test]
    fn domain_expiry_and_freeze() {
        for case in 0..4 {
            let (mut s, mut d, t, sig) = fixture();
            let before = s.clone();
            match case {
                0 => d.chain_id = 31338.into(),
                1 => d.hub = [6; 20],
                2 => {}
                _ => {
                    s.frozen_assets.insert(t.asset_id);
                }
            }
            let old = s.clone();
            assert!(s
                .apply(&d, &t, &sig, [8; 20], if case == 2 { 101 } else { 100 })
                .is_err());
            assert_eq!(s, old);
            if case < 3 {
                assert_eq!(s, before)
            }
        }
    }
    #[test]
    fn insufficient_fee_rolls_back() {
        let (mut s, d, t, sig) = fixture();
        s.balances.insert((t.from, t.asset_id), 10.into());
        let old = s.clone();
        assert_eq!(s.apply(&d, &t, &sig, [8; 20], 100), Err("balance"));
        assert_eq!(s, old);
    }
    #[test]
    fn origins_do_not_merge() {
        assert_ne!(
            asset_id(31338.into(), [0; 20]),
            asset_id(31339.into(), [0; 20])
        );
    }
    #[test]
    fn malformed_signature_is_rejected() {
        let (mut s, d, t, mut sig) = fixture();
        sig[64] = 0;
        assert!(s.apply(&d, &t, &sig, [8; 20], 100).is_err());
    }
    #[test]
    fn viem_typed_data_vector() {
        let (_, d, t, _) = fixture();
        let actual = digest(&d, &t)
            .iter()
            .map(|b| format!("{b:02x}"))
            .collect::<String>();
        assert_eq!(
            actual,
            "9b44a6e2424e543505909bbba7635d477853d39bb16d700c5f45465d10eaf347"
        );
    }
    #[test]
    fn signed_fields_cannot_be_substituted() {
        for case in 0..4 {
            let (mut s, d, mut t, sig) = fixture();
            match case {
                0 => t.to = [9; 20],
                1 => t.manifest_hash = [9; 32],
                2 => t.service_id = [9; 32],
                _ => t.fee = 2.into(),
            }
            let old = s.clone();
            assert!(s.apply(&d, &t, &sig, [8; 20], 100).is_err());
            assert_eq!(s, old);
        }
    }
}
