// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {NativePaymentPilot} from "./NativePaymentPilot.sol";

/// @notice Participants jointly authorize net balance changes for a reviewed payment window.
/// @dev The payment-list commitment identifies the agreed list. Individual payments are verified by clients.
contract NativeClearingPilot is NativePaymentPilot {
    bytes32 public constant WINDOW_TYPEHASH =
        keccak256("ClearWindow(bytes32 entriesHash,bytes32 paymentsHash,uint64 deadline)");

    struct Entry {
        address owner;
        uint256 nonce;
        int256 delta;
    }

    event WindowCleared(bytes32 indexed digest, bytes32 indexed paymentsHash, uint256 participants);

    function hashWindow(Entry[] calldata entries, bytes32 paymentsHash, uint64 deadline)
        public view returns (bytes32)
    {
        return _hashTypedDataV4(keccak256(abi.encode(WINDOW_TYPEHASH, keccak256(abi.encode(entries)), paymentsHash, deadline)));
    }

    function clear(Entry[] calldata entries, bytes32 paymentsHash, uint64 deadline, bytes[] calldata signatures) external {
        if (entries.length < 2 || entries.length != signatures.length || block.timestamp > deadline) {
            revert InvalidPayment();
        }
        bytes32 digest = hashWindow(entries, paymentsHash, deadline);
        address previous;
        int256 total;
        for (uint256 i; i < entries.length; ++i) {
            Entry calldata entry = entries[i];
            if (entry.owner <= previous || entry.nonce != nonceOf[entry.owner]) revert InvalidPayment();
            if (ECDSA.recover(digest, signatures[i]) != entry.owner) revert InvalidSignature();
            previous = entry.owner;
            total += entry.delta;
            nonceOf[entry.owner] = entry.nonce + 1;
            if (entry.delta < 0) {
                uint256 debit = uint256(-entry.delta);
                if (balanceOf[entry.owner] < debit) revert InsufficientBalance();
                balanceOf[entry.owner] -= debit;
            } else if (entry.delta > 0) {
                balanceOf[entry.owner] += uint256(entry.delta);
            }
        }
        if (total != 0) revert InvalidPayment();
        emit WindowCleared(digest, paymentsHash, entries.length);
    }
}
