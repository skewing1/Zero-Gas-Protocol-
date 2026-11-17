// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {SignedPayout7702} from "../src/SignedPayout7702.sol";

contract SignedPayout7702SelfPayoutTest is Test {
    uint256 internal constant KEY = 0xA11CE;
    address internal owner;
    SignedPayout7702 internal account;

    function setUp() public {
        owner = vm.addr(KEY);
        SignedPayout7702 impl = new SignedPayout7702();
        vm.etch(owner, address(impl).code);
        account = SignedPayout7702(payable(owner));
        vm.deal(owner, 1 ether);
    }

    function testSingleNativeSelfPayoutRevertsWithoutConsumingNonce() public {
        SignedPayout7702.Payout memory p = SignedPayout7702.Payout(
            address(0), payable(owner), 0.1 ether, 0, block.timestamp + 100
        );
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(KEY, account.digest(p));
        uint256 beforeBalance = owner.balance;
        vm.expectRevert(SignedPayout7702.InvalidPayout.selector);
        vm.prank(address(0xDEAD));
        account.execute(p, abi.encodePacked(r, s, v));
        assertEq(owner.balance, beforeBalance);
        assertEq(account.nonce(), 0);
    }

    function testAtomicBatchRejectsSelfRecipientBeforeAnyTransfer() public {
        address payable recipient = payable(address(0xB0B));
        SignedPayout7702.PayoutItem[] memory items = new SignedPayout7702.PayoutItem[](2);
        items[0] = SignedPayout7702.PayoutItem(address(0), recipient, 0.1 ether);
        items[1] = SignedPayout7702.PayoutItem(address(0), payable(owner), 0.1 ether);
        uint256 deadline = block.timestamp + 100;
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(KEY, account.batchDigest(items, 0, deadline));
        vm.expectRevert(SignedPayout7702.InvalidPayout.selector);
        vm.prank(address(0xDEAD));
        account.executeMany(items, 0, deadline, abi.encodePacked(r, s, v));
        assertEq(recipient.balance, 0);
        assertEq(account.nonce(), 0);
    }
}
