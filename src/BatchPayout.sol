// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

interface IERC20 {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

/// @notice Push payout helper used by the receipt benchmarks.
contract BatchPayout {
    error InvalidLength();
    error InvalidRecipient();
    error PaymentFailed();

    function payNative(address[] calldata to, uint256[] calldata amt) external payable {
        if (to.length != amt.length) revert InvalidLength();
        uint256 remaining = msg.value;
        for (uint256 i; i < to.length; ++i) {
            if (to[i] == address(0)) revert InvalidRecipient();
            remaining -= amt[i];
            (bool sent,) = payable(to[i]).call{value: amt[i]}("");
            if (!sent) revert PaymentFailed();
        }
        if (remaining != 0) {
            (bool refunded,) = payable(msg.sender).call{value: remaining}("");
            if (!refunded) revert PaymentFailed();
        }
    }

    function payToken(IERC20 token, address[] calldata to, uint256[] calldata amt) external {
        if (to.length != amt.length) revert InvalidLength();
        for (uint256 i; i < to.length; ++i) {
            if (to[i] == address(0)) revert InvalidRecipient();
            if (!token.transferFrom(msg.sender, to[i], amt[i])) revert PaymentFailed();
        }
    }
}
