// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {SignedPayout7702} from "../src/SignedPayout7702.sol";

contract SignedPayout7702BatchTest is Test {
    uint256 internal constant OWNER_KEY = 0xA11CE;
    address internal owner;
    SignedPayout7702 internal account;
    address payable internal alice = payable(address(0xB0B));
    address payable internal bob = payable(address(0xCAFE));

    function setUp() public {
        owner = vm.addr(OWNER_KEY);
        SignedPayout7702 implementation = new SignedPayout7702();
        vm.etch(owner, address(implementation).code);
        account = SignedPayout7702(payable(owner));
        vm.deal(owner, 10 ether);
    }

    function _items() internal view returns (SignedPayout7702.PayoutItem[] memory items) {
        items = new SignedPayout7702.PayoutItem[](2);
        items[0] = SignedPayout7702.PayoutItem(address(0), alice, 2 ether);
        items[1] = SignedPayout7702.PayoutItem(address(0), bob, 3 ether);
    }

    function _sign(SignedPayout7702.PayoutItem[] memory items, uint256 n, uint256 deadline)
        internal returns (bytes memory)
    {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(OWNER_KEY, account.batchDigest(items, n, deadline));
        return abi.encodePacked(r, s, v);
    }

    function testRelayerCanExecuteAtomicBatchAndCannotReplay() public {
        SignedPayout7702.PayoutItem[] memory items = _items();
        uint256 deadline = block.timestamp + 100;
        bytes memory signature = _sign(items, 0, deadline);
        vm.prank(address(0xDEAD));
        account.executeMany(items, 0, deadline, signature);
        assertEq(alice.balance, 2 ether);
        assertEq(bob.balance, 3 ether);
        assertEq(owner.balance, 5 ether);
        assertEq(account.nonce(), 1);
        vm.expectRevert(SignedPayout7702.InvalidNonce.selector);
        account.executeMany(items, 0, deadline, signature);
    }

    function testTamperedRecipientRevertsWithoutConsumingNonce() public {
        SignedPayout7702.PayoutItem[] memory items = _items();
        uint256 deadline = block.timestamp + 100;
        bytes memory signature = _sign(items, 0, deadline);
        items[1].recipient = payable(address(0xDEAD));
        vm.expectRevert(SignedPayout7702.InvalidSignature.selector);
        account.executeMany(items, 0, deadline, signature);
        assertEq(account.nonce(), 0);
        assertEq(alice.balance, 0);
    }

    function testInsufficientBalanceRevertsAllTransfers() public {
        SignedPayout7702.PayoutItem[] memory items = _items();
        items[1].amount = 20 ether;
        uint256 deadline = block.timestamp + 100;
        bytes memory signature = _sign(items, 0, deadline);
        vm.expectRevert(SignedPayout7702.TransferFailed.selector);
        account.executeMany(items, 0, deadline, signature);
        assertEq(account.nonce(), 0);
        assertEq(alice.balance, 0);
        assertEq(bob.balance, 0);
    }

    function testEmptyAndOversizedBatchRejected() public {
        SignedPayout7702.PayoutItem[] memory empty = new SignedPayout7702.PayoutItem[](0);
        vm.expectRevert(SignedPayout7702.InvalidBatchLength.selector);
        account.batchDigest(empty, 0, block.timestamp + 100);
        SignedPayout7702.PayoutItem[] memory oversized = new SignedPayout7702.PayoutItem[](65);
        vm.expectRevert(SignedPayout7702.InvalidBatchLength.selector);
        account.batchDigest(oversized, 0, block.timestamp + 100);
    }

    function testNonceInvalidationCancelsSignedBatch() public {
        SignedPayout7702.PayoutItem[] memory items = _items();
        uint256 deadline = block.timestamp + 100;
        bytes memory signature = _sign(items, 0, deadline);
        vm.prank(owner);
        account.invalidateNonce(1);
        vm.expectRevert(SignedPayout7702.InvalidNonce.selector);
        account.executeMany(items, 0, deadline, signature);
        assertEq(alice.balance, 0);
        assertEq(bob.balance, 0);
    }

    function testOrderChangeInvalidatesSignature() public {
        SignedPayout7702.PayoutItem[] memory items = _items();
        uint256 deadline = block.timestamp + 100;
        bytes memory signature = _sign(items, 0, deadline);
        SignedPayout7702.PayoutItem memory temp = items[0];
        items[0] = items[1];
        items[1] = temp;
        vm.expectRevert(SignedPayout7702.InvalidSignature.selector);
        account.executeMany(items, 0, deadline, signature);
    }
}
