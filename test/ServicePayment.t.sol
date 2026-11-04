// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {ServicePayment} from "../src/ServicePayment.sol";

contract ServicePaymentTest is Test {
    event ServicePaid(
        bytes32 indexed listingDigest, address indexed payer, address indexed payee, uint256 amount
    );

    function testPaymentTransfersFundsAndEmitsListingReceipt() public {
        ServicePayment settlement = new ServicePayment();
        address payable seller = payable(address(0x10000));
        bytes32 listing = sha256("signed service record");
        vm.deal(address(this), 1 ether);

        vm.expectEmit(true, true, true, true, address(settlement));
        emit ServicePaid(listing, address(this), seller, 1 ether);
        settlement.pay{value: 1 ether}(listing, seller);

        assertEq(seller.balance, 1 ether);
        assertEq(address(settlement).balance, 0);
    }

    function testRejectsEmptyPayment() public {
        ServicePayment settlement = new ServicePayment();
        vm.expectRevert(ServicePayment.InvalidPayment.selector);
        settlement.pay(sha256("signed service record"), payable(address(0x10000)));
    }
}
