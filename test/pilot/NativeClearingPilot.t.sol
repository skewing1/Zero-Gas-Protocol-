// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Test} from "forge-std/Test.sol";
import {NativeClearingPilot} from "../../src/pilot/NativeClearingPilot.sol";
import {NativePaymentPilot} from "../../src/pilot/NativePaymentPilot.sol";

contract NativeClearingPilotTest is Test {
    NativeClearingPilot private pilot;
    uint256 private constant DEBTOR_KEY = 0xa11ce;
    uint256 private constant CREDITOR_KEY = 0xb0b;
    bytes32 private constant PAYMENTS = keccak256("reviewed payment list");
    address private debtor;
    address private creditor;

    function setUp() public {
        pilot = new NativeClearingPilot();
        debtor = vm.addr(DEBTOR_KEY);
        creditor = vm.addr(CREDITOR_KEY);
        vm.deal(debtor, 100);
        vm.prank(debtor);
        pilot.deposit{value: 100}();
    }

    function signedWindow(int256 credit)
        private
        view
        returns (NativeClearingPilot.Entry[] memory entries, bytes[] memory signatures)
    {
        entries = new NativeClearingPilot.Entry[](2);
        signatures = new bytes[](2);
        uint256 debtorIndex = debtor < creditor ? 0 : 1;
        entries[debtorIndex] = NativeClearingPilot.Entry(debtor, 0, -40);
        entries[1 - debtorIndex] = NativeClearingPilot.Entry(creditor, 0, credit);
        bytes32 digest = pilot.hashWindow(entries, PAYMENTS, uint64(block.timestamp));
        for (uint256 i; i < entries.length; ++i) {
            (uint8 v, bytes32 r, bytes32 s) = vm.sign(i == debtorIndex ? DEBTOR_KEY : CREDITOR_KEY, digest);
            signatures[i] = abi.encodePacked(r, s, v);
        }
    }

    function testConsentBindsListAndNetAmountsAndPreventsReplay() public {
        (NativeClearingPilot.Entry[] memory entries, bytes[] memory signatures) = signedWindow(40);
        uint64 deadline = uint64(block.timestamp);
        vm.expectRevert(NativePaymentPilot.InvalidSignature.selector);
        pilot.clear(entries, keccak256("substituted list"), deadline, signatures);

        pilot.clear(entries, PAYMENTS, deadline, signatures);
        assertEq(pilot.balanceOf(debtor), 60);
        assertEq(pilot.balanceOf(creditor), 40);
        vm.expectRevert(NativePaymentPilot.InvalidPayment.selector);
        pilot.clear(entries, PAYMENTS, deadline, signatures);

        vm.prank(creditor);
        pilot.withdraw(40);
        assertEq(creditor.balance, 40);
        assertEq(address(pilot).balance, 60);
    }

    function testEvenUnanimousConsentCannotCreateFunds() public {
        (NativeClearingPilot.Entry[] memory entries, bytes[] memory signatures) = signedWindow(41);
        vm.expectRevert(NativePaymentPilot.InvalidPayment.selector);
        pilot.clear(entries, PAYMENTS, uint64(block.timestamp), signatures);
        assertEq(pilot.balanceOf(debtor), 100);
        assertEq(pilot.balanceOf(creditor), 0);
        assertEq(pilot.nonceOf(debtor), 0);
    }
}
