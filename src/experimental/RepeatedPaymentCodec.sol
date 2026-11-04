// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {PaymentCodec} from "./PaymentCodec.sol";

/// @notice Lossless periodic encoding: uint32 repeats, uint16 pattern length,
/// then pattern-length records of uint8 recipient index + uint64 amount.
library RepeatedPaymentCodec {
    error InvalidEncoding();
    function sum(uint256 recipientCount, bytes calldata data)
        internal pure returns (uint256[] memory totals, uint256 paymentCount)
    {
        if (data.length < 6) revert InvalidEncoding();
        uint256 repeats;
        uint256 patternLength;
        assembly ("memory-safe") {
            let header := calldataload(data.offset)
            repeats := shr(224, header)
            patternLength := and(shr(208, header), 0xffff)
        }
        if (repeats == 0 || patternLength == 0 || data.length != 6 + patternLength * 9) revert InvalidEncoding();
        totals = PaymentCodec.sum(recipientCount, data[6:]);
        paymentCount = patternLength * repeats;
        for (uint256 i; i < totals.length; ++i) totals[i] *= repeats;
    }
}
