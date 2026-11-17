// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {SignedPayout7702} from "../src/SignedPayout7702.sol";

contract FeeOnTransferFixture {
    mapping(address => uint256) public balanceOf;
    constructor(address owner) { balanceOf[owner] = 1_000_000; }
    function transfer(address to, uint256 amount) external returns (bool) {
        require(balanceOf[msg.sender] >= amount, "funds");
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount - (amount / 100);
        return true;
    }
}

contract StandardTokenFixture {
    mapping(address => uint256) public balanceOf;
    constructor(address owner) { balanceOf[owner] = 1_000_000; }
    function transfer(address to, uint256 amount) external returns (bool) {
        require(balanceOf[msg.sender] >= amount, "funds");
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }
}

contract SignedPayout7702ExactDeliveryTest is Test {
    uint256 internal constant KEY = 0xA11CE;
    address internal owner;
    SignedPayout7702 internal account;
    address payable internal recipient = payable(address(0xB0B));

    function setUp() public {
        owner = vm.addr(KEY);
        SignedPayout7702 impl = new SignedPayout7702();
        vm.etch(owner, address(impl).code);
        account = SignedPayout7702(payable(owner));
    }

    function _signature(SignedPayout7702.Payout memory payout) internal returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(KEY, account.digest(payout));
        return abi.encodePacked(r, s, v);
    }

    function testFeeOnTransferRejectsWithoutNonceOrBalanceChange() public {
        FeeOnTransferFixture token = new FeeOnTransferFixture(owner);
        SignedPayout7702.Payout memory p = SignedPayout7702.Payout(
            address(token), recipient, 100, 0, block.timestamp + 100
        );
        bytes memory signature = _signature(p);
        vm.prank(address(0xDEAD));
        vm.expectRevert(SignedPayout7702.TransferFailed.selector);
        account.execute(p, signature);
        assertEq(token.balanceOf(recipient), 0);
        assertEq(token.balanceOf(owner), 1_000_000);
        assertEq(account.nonce(), 0);
    }

    function testStandardTokenTransfersExactAmount() public {
        StandardTokenFixture token = new StandardTokenFixture(owner);
        SignedPayout7702.Payout memory p = SignedPayout7702.Payout(
            address(token), recipient, 100, 0, block.timestamp + 100
        );
        bytes memory signature = _signature(p);
        vm.prank(address(0xDEAD));
        account.execute(p, signature);
        assertEq(token.balanceOf(recipient), 100);
        assertEq(token.balanceOf(owner), 999_900);
        assertEq(account.nonce(), 1);
    }

    function testBatchFeeOnTransferRevertsEarlierPaymentsAtomically() public {
        StandardTokenFixture standard = new StandardTokenFixture(owner);
        FeeOnTransferFixture fee = new FeeOnTransferFixture(owner);
        SignedPayout7702.PayoutItem[] memory items = new SignedPayout7702.PayoutItem[](2);
        items[0] = SignedPayout7702.PayoutItem(address(standard), recipient, 50);
        items[1] = SignedPayout7702.PayoutItem(address(fee), recipient, 100);
        uint256 deadline = block.timestamp + 100;
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(KEY, account.batchDigest(items, 0, deadline));
        vm.prank(address(0xDEAD));
        vm.expectRevert(SignedPayout7702.TransferFailed.selector);
        account.executeMany(items, 0, deadline, abi.encodePacked(r, s, v));
        assertEq(standard.balanceOf(recipient), 0);
        assertEq(fee.balanceOf(recipient), 0);
        assertEq(account.nonce(), 0);
    }
}
