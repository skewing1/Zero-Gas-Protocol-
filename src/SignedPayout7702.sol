// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @notice Experimental EIP-7702 delegate implementation for a single signed payout.
/// @dev The EOA MUST separately authorize this implementation using the EIP-7702
/// authorization tuple. This contract does not create/validate that tuple.
/// Signature verification uses address(this), the delegated EOA, and an
/// immutable implementation-specific domain salt. Do not use as a proxy or wallet.
/// IMPORTANT: replacing a delegate changes the signing domain; reverting to an
/// old delegate restores its domain and stored nonce, so revoke old keys/intents.
contract SignedPayout7702 {
    bytes32 private constant DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract,bytes32 salt)");
    bytes32 private constant INTENT_TYPEHASH =
        keccak256("Payout(address asset,address recipient,uint256 amount,uint256 nonce,uint256 deadline)");
    bytes32 private constant NAME_HASH = keccak256("ZeroGasSignedPayout");
    bytes32 private constant VERSION_HASH = keccak256("2");
    // Each deployment embeds its own address in delegated runtime bytecode.
    // Prevents old signatures from authorizing a different delegate implementation.
    address private immutable IMPLEMENTATION = address(this);
    uint256 private constant SECP256K1_HALF_N =
        0x7fffffffffffffffffffffffffffffff5d576e7357a4501ddfe92f46681b20a0;
    bytes32 private constant STORAGE_SLOT =
        bytes32(uint256(keccak256("zero-gas-protocol.signed-payout-7702.storage.v1")) - 1);

    struct State {
        uint256 nonce;
        uint256 entered;
    }

    struct PayoutItem {
        address asset;
        address payable recipient;
        uint256 amount;
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
    error OnlyAccount();
    error NonceNotIncreasing();
    error InvalidBatchLength();

    bytes32 private constant ITEM_TYPEHASH = keccak256("PayoutItem(address asset,address recipient,uint256 amount)");
    bytes32 private constant BATCH_TYPEHASH = keccak256("PayoutBatch(bytes32 payoutsHash,uint256 nonce,uint256 deadline)");
    uint256 public constant MAX_BATCH_ITEMS = 64;

    event BatchExecuted(address indexed account, uint256 indexed nonce, uint256 count, address relayer);

    event PayoutExecuted(
        address indexed account, address indexed recipient, address indexed asset,
        uint256 amount, uint256 nonce, address relayer
    );

    function _state() private pure returns (State storage s) {
        bytes32 slot = STORAGE_SLOT;
        assembly { s.slot := slot }
    }

    event NonceInvalidated(address indexed account, uint256 oldNonce, uint256 newNonce);

    /// @notice The EOA owner may send a transaction FROM the account TO itself
    /// to invalidate all pending signatures with smaller nonces. A relayer
    /// cannot call this function on behalf of the owner.
    /// @dev EIP-7702 delegated EOAs execute in their own storage context.
    /// This does not invalidate signatures if delegation later switches to
    /// an implementation with incompatible nonce storage or restores old state.
    function invalidateNonce(uint256 newNonce) external {
        if (msg.sender != address(this)) revert OnlyAccount();
        State storage s = _state();
        if (s.entered != 0) revert Reentered();
        uint256 oldNonce = s.nonce;
        if (newNonce <= oldNonce) revert NonceNotIncreasing();
        s.nonce = newNonce;
        emit NonceInvalidated(address(this), oldNonce, newNonce);
    }

    function nonce() external view returns (uint256) {
        return _state().nonce;
    }

    function domainSeparator() public view returns (bytes32) {
        return keccak256(abi.encode(
            DOMAIN_TYPEHASH, NAME_HASH, VERSION_HASH, block.chainid, address(this),
            bytes32(uint256(uint160(IMPLEMENTATION)))
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


    /// @notice One owner signature authorizes an atomic, ordered group of payouts.
    /// @dev EIP-712 PayoutBatch hashes ordered PayoutItem structs, not raw ABI
    /// calldata. The signature is domain-bound to chain, EOA, and implementation.
    /// Every item executes or the entire transaction reverts, including nonce.
    function batchDigest(PayoutItem[] calldata items, uint256 expectedNonce, uint256 deadline)
        public view returns (bytes32)
    {
        uint256 length = items.length;
        if (length == 0 || length > MAX_BATCH_ITEMS) revert InvalidBatchLength();
        bytes32[] memory hashes = new bytes32[](length);
        for (uint256 i; i < length; ++i) {
            hashes[i] = keccak256(abi.encode(
                ITEM_TYPEHASH, items[i].asset, items[i].recipient, items[i].amount
            ));
        }
        bytes32 structHash = keccak256(abi.encode(
            BATCH_TYPEHASH, keccak256(abi.encodePacked(hashes)), expectedNonce, deadline
        ));
        return keccak256(abi.encodePacked("\\x19\\x01", domainSeparator(), structHash));
    }

    function executeMany(
        PayoutItem[] calldata items, uint256 expectedNonce, uint256 deadline, bytes calldata signature
    ) external payable {
        if (msg.value != 0) revert ValueNotAllowed();
        State storage s = _state();
        if (s.entered != 0) revert Reentered();
        if (expectedNonce != s.nonce) revert InvalidNonce();
        if (block.timestamp > deadline) revert Expired();
        uint256 length = items.length;
        if (length == 0 || length > MAX_BATCH_ITEMS) revert InvalidBatchLength();
        for (uint256 i; i < length; ++i) {
            if (items[i].recipient == address(0) || items[i].amount == 0) revert InvalidPayout();
        }
        if (_recover(batchDigest(items, expectedNonce, deadline), signature) != address(this)) {
            revert InvalidSignature();
        }
        s.entered = 1;
        s.nonce = expectedNonce + 1;
        for (uint256 i; i < length; ++i) {
            PayoutItem calldata p = items[i];
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
        }
        s.entered = 0;
        emit BatchExecuted(address(this), expectedNonce, length, msg.sender);
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
