// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @notice Experimental EIP-7702 delegate implementation for a single signed payout.
/// @dev The EOA MUST separately authorize this implementation using the EIP-7702
/// authorization tuple. This contract does not create/validate that tuple.
/// Signature verification uses address(this), which is the delegated EOA in a
/// 7702 call. Never use this implementation as a proxy or ordinary wallet.
contract SignedPayout7702 {
    bytes32 private constant DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");
    bytes32 private constant INTENT_TYPEHASH =
        keccak256("Payout(address asset,address recipient,uint256 amount,uint256 nonce,uint256 deadline)");
    bytes32 private constant NAME_HASH = keccak256("ZeroGasSignedPayout");
    bytes32 private constant VERSION_HASH = keccak256("1");
    uint256 private constant SECP256K1_HALF_N =
        0x7fffffffffffffffffffffffffffffff5d576e7357a4501ddfe92f46681b20a0;
    bytes32 private constant STORAGE_SLOT =
        bytes32(uint256(keccak256("zero-gas-protocol.signed-payout-7702.storage.v1")) - 1);

    struct State {
        uint256 nonce;
        uint256 entered;
    }

    struct Payout {
        address asset; // address(0) = native ETH
        address payable recipient;
        uint256 amount;
        uint256 nonce;
        uint256 deadline;
    }

    error InvalidSignature();
    error InvalidNonce();
    error Expired();
    error InvalidPayout();
    error Reentered();
    error TransferFailed();
    error ValueNotAllowed();

    event PayoutExecuted(
        address indexed account, address indexed recipient, address indexed asset,
        uint256 amount, uint256 nonce, address relayer
    );

    function _state() private pure returns (State storage s) {
        bytes32 slot = STORAGE_SLOT;
        assembly { s.slot := slot }
    }

    function nonce() external view returns (uint256) {
        return _state().nonce;
    }

    function domainSeparator() public view returns (bytes32) {
        return keccak256(abi.encode(
            DOMAIN_TYPEHASH, NAME_HASH, VERSION_HASH, block.chainid, address(this)
        ));
    }

    function digest(Payout calldata p) public view returns (bytes32) {
        bytes32 structHash = keccak256(abi.encode(
            INTENT_TYPEHASH, p.asset, p.recipient, p.amount, p.nonce, p.deadline
        ));
        return keccak256(abi.encodePacked("\x19\x01", domainSeparator(), structHash));
    }

    /// @notice Anyone can relay; only the delegated EOA can sign a valid payout.
    /// @dev Atomic execution: nonce increment and guard revert on failed transfers.
    function execute(Payout calldata p, bytes calldata signature) external payable {
        if (msg.value != 0) revert ValueNotAllowed();
        State storage s = _state();
        if (s.entered != 0) revert Reentered();
        if (p.nonce != s.nonce) revert InvalidNonce();
        if (block.timestamp > p.deadline) revert Expired();
        if (p.recipient == address(0) || p.amount == 0) revert InvalidPayout();
        if (_recover(digest(p), signature) != address(this)) revert InvalidSignature();

        s.entered = 1;
        s.nonce = p.nonce + 1;

        if (p.asset == address(0)) {
            (bool ok,) = p.recipient.call{value: p.amount}("");
            if (!ok) revert TransferFailed();
        } else {
            if (p.asset.code.length == 0) revert TransferFailed();
            (bool ok, bytes memory data) = p.asset.call(
                abi.encodeWithSelector(0xa9059cbb, p.recipient, p.amount)
            );
            if (!ok || (data.length != 0 && (data.length != 32 || !abi.decode(data, (bool))))) {
                revert TransferFailed();
            }
        }

        s.entered = 0;
        emit PayoutExecuted(address(this), p.recipient, p.asset, p.amount, p.nonce, msg.sender);
    }

    function _recover(bytes32 h, bytes calldata sig) private pure returns (address signer) {
        if (sig.length != 65) revert InvalidSignature();
        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := calldataload(sig.offset)
            s := calldataload(add(sig.offset, 32))
            v := byte(0, calldataload(add(sig.offset, 64)))
        }
        if ((v != 27 && v != 28) || uint256(s) == 0 ||
            uint256(s) > SECP256K1_HALF_N || r == bytes32(0)) revert InvalidSignature();
        signer = ecrecover(h, v, r, s);
        if (signer == address(0)) revert InvalidSignature();
    }
}
