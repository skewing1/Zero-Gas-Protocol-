// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

/// @notice Decodes the complete signed list; never accepts precomputed totals.
library PaymentCodec {
    error InvalidEncoding();
    error InvalidRecipients();

    function sum(uint256 recipientCount, bytes calldata payments) internal pure returns (uint256[] memory totals) {
        if (recipientCount == 0 || recipientCount > 256) revert InvalidRecipients();
        if (payments.length == 0 || payments.length % 9 != 0) revert InvalidEncoding();
        totals = new uint256[](recipientCount);
        uint256 invalidSelector = uint32(InvalidEncoding.selector);
        // Every write is bounded by recipientCount within the allocated array.
        // Nine-byte records and the ABI calldata bounds guarantee cursor alignment.
        assembly ("memory-safe") {
            let end := add(payments.offset, payments.length)
            let base := add(totals, 32)
            for { let cursor := payments.offset } lt(cursor, end) { cursor := add(cursor, 9) } {
                let packed := calldataload(cursor)
                let index := byte(0, packed)
                let amount := and(shr(184, packed), 0xffffffffffffffff)
                if or(iszero(lt(index, recipientCount)), iszero(amount)) {
                    mstore(0, shl(224, invalidSelector))
                    revert(0, 4)
                }
                let slot := add(base, shl(5, index))
                let previous := mload(slot)
                let next := add(previous, amount)
                // Preserve checked arithmetic, even though practical calldata limits
                // make a uint256 total overflow unreachable with uint64 records.
                if lt(next, previous) {
                    mstore(0, 0x4e487b71)
                    mstore(32, 0x11)
                    revert(28, 36)
                }
                mstore(slot, next)
            }
        }
    }
}
