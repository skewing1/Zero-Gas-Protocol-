// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @notice Minimal EIP-7702 delegated EOA native payout executor.
/// @dev Intended to execute in an EOA's storage/balance context via EIP-7702.
///      Authorization-list signing/delegation happens outside this contract.
///      Experimental: no ERC-1271, tokens, recovery or cross-chain execution.
contract DelegatedBatchAccount {
    bytes32 private constant DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract,bytes32 salt)");
    bytes32 private constant INTENT_TYPEHASH =
        keccak256("BatchIntent(bytes32 payoutsHash,uint256 nonce,uint256 deadline,uint256 relayerFee)");
    bytes32 private constant CANCEL_TYPEHASH = keccak256("CancelIntent(uint256 nonce,uint256 deadline)");
    bytes32 private constant NAME_HASH = keccak256("ZeroGasDelegatedBatch");
    bytes32 private constant VERSION_HASH = keccak256("2");
    uint256 private constant SECP256K1_HALF_N =
        0x7fffffffffffffffffffffffffffffff5d576e7357a4501ddfe92f46681b20a0;

    // Immutable is embedded in runtime bytecode and remains the implementation address under 7702 delegation.
    address private immutable IMPLEMENTATION = address(this);

    // A dedicated slot avoids collisions with common delegated-account storage.
    bytes32 private constant NONCE_SLOT =
        keccak256("zero-gas-protocol.delegated-batch.nonce.v1");
    bytes32 private constant LOCK_SLOT =
        keccak256("zero-gas-protocol.delegated-batch.lock.v1");

    error InvalidInput();
    error Expired();
    error InvalidSignature();
    error PaymentFailed();
    error Reentrant();
    error InsufficientBalance();

    event IntentCancelled(uint256 indexed nonce, bytes32 indexed digest, address indexed submitter);
    event BatchExecuted(bytes32 indexed digest, uint256 indexed nonce, address indexed relayer, uint256 count, uint256 relayerFee);

    function nonce() public view returns (uint256 n) {
        bytes32 slot = NONCE_SLOT;
        assembly { n := sload(slot) }
    }

    function domainSeparator() public view returns (bytes32) {
        return keccak256(abi.encode(DOMAIN_TYPEHASH, NAME_HASH, VERSION_HASH, block.chainid, address(this), bytes32(uint256(uint160(IMPLEMENTATION)))));
    }

    function intentDigest(
        address[] calldata recipients,
        uint256[] calldata amounts,
        uint256 expectedNonce,
        uint256 deadline,
        uint256 relayerFee
    ) public view returns (bytes32) {
        bytes32 payoutsHash = keccak256(abi.encode(recipients, amounts));
        bytes32 structHash = keccak256(abi.encode(INTENT_TYPEHASH, payoutsHash, expectedNonce, deadline, relayerFee));
        return keccak256(abi.encodePacked(bytes2(0x1901), domainSeparator(), structHash));
    }

    /// @notice Permissionless cancellation of the currently active batch nonce.
    /// @dev The signature is bound to this account, chain and implementation by the domain.
    ///      No ETH is transferred; the submitting relayer pays its own network fee.
    function cancelDigest(uint256 expectedNonce, uint256 deadline) public view returns (bytes32) {
        bytes32 structHash = keccak256(abi.encode(CANCEL_TYPEHASH, expectedNonce, deadline));
        return keccak256(abi.encodePacked(bytes2(0x1901), domainSeparator(), structHash));
    }

    function cancelIntent(uint256 expectedNonce, uint256 deadline, bytes calldata signature) external {
        bytes32 lockSlot = LOCK_SLOT;
        uint256 locked;
        assembly { locked := sload(lockSlot) }
        if (locked != 0) revert Reentrant();
        if (block.timestamp > deadline) revert Expired();
        uint256 currentNonce = nonce();
        if (expectedNonce != currentNonce) revert InvalidInput();
        bytes32 digest = cancelDigest(expectedNonce, deadline);
        if (!_validEOASignature(digest, signature)) revert InvalidSignature();
        bytes32 nonceSlot = NONCE_SLOT;
        assembly { sstore(nonceSlot, add(currentNonce, 1)) }
        emit IntentCancelled(currentNonce, digest, msg.sender);
    }

    /// @notice Anyone may relay a signed batch. The delegated EOA pays recipients and the caller.
    /// @dev Signer must be the EOA address(this), not the implementation contract.
    ///      Every transfer is atomic; failure reverts nonce and all payments.
    function executeBatch(
        address[] calldata recipients,
        uint256[] calldata amounts,
        uint256 expectedNonce,
        uint256 deadline,
        uint256 relayerFee,
        bytes calldata signature
    ) external {
        bytes32 lockSlot = LOCK_SLOT;
        uint256 locked;
        assembly { locked := sload(lockSlot) }
        if (locked != 0) revert Reentrant();
        if (block.timestamp > deadline) revert Expired();
        if (recipients.length == 0 || recipients.length != amounts.length || recipients.length > 256) revert InvalidInput();
        uint256 currentNonce = nonce();
        if (expectedNonce != currentNonce) revert InvalidInput();

        bytes32 digest = intentDigest(recipients, amounts, expectedNonce, deadline, relayerFee);
        if (!_validEOASignature(digest, signature)) revert InvalidSignature();

        uint256 total = relayerFee;
        for (uint256 i; i < recipients.length; ++i) {
            if (recipients[i] == address(0) || recipients[i] == address(this) || amounts[i] == 0) revert InvalidInput();
            total += amounts[i];
        }
        if (total > address(this).balance) revert InsufficientBalance();

        bytes32 nonceSlot = NONCE_SLOT;
        assembly {
            sstore(lockSlot, 1)
            sstore(nonceSlot, add(currentNonce, 1))
        }
        for (uint256 i; i < recipients.length; ++i) {
            (bool ok,) = payable(recipients[i]).call{value: amounts[i]}("");
            if (!ok) revert PaymentFailed();
        }
        if (relayerFee != 0) {
            (bool ok,) = payable(msg.sender).call{value: relayerFee}("");
            if (!ok) revert PaymentFailed();
        }
        assembly { sstore(lockSlot, 0) }
        emit BatchExecuted(digest, expectedNonce, msg.sender, recipients.length, relayerFee);
    }

    function _validEOASignature(bytes32 digest, bytes calldata signature) private view returns (bool) {
        if (signature.length != 65) return false;
        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := calldataload(signature.offset)
            s := calldataload(add(signature.offset, 32))
            v := byte(0, calldataload(add(signature.offset, 64)))
        }
        if (v != 27 && v != 28) return false;
        if (uint256(s) == 0 || uint256(s) > SECP256K1_HALF_N) return false;
        address recovered = ecrecover(digest, v, r, s);
        return recovered != address(0) && recovered == address(this);
    }
}
