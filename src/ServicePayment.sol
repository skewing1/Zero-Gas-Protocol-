// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @notice Native-asset payment with a receipt bound to a listing digest.
/// The buyer must obtain the payee and price from an authenticated quote.
contract ServicePayment {
    error InvalidPayment();
    error PaymentFailed();

    event ServicePaid(
        bytes32 indexed listingDigest, address indexed payer, address indexed payee, uint256 amount
    );

    function pay(bytes32 listingDigest, address payable payee) external payable {
        if (listingDigest == bytes32(0) || payee == address(0) || msg.value == 0) revert InvalidPayment();

        (bool success,) = payee.call{value: msg.value}("");
        if (!success) revert PaymentFailed();

        emit ServicePaid(listingDigest, msg.sender, payee, msg.value);
    }
}
