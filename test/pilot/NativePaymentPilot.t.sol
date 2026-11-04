// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Test} from "forge-std/Test.sol";
import {NativePaymentPilot} from "../../src/pilot/NativePaymentPilot.sol";

contract NativePaymentPilotTest is Test {
    NativePaymentPilot private pilot;
    uint256 private constant ALICE_KEY = 0xa11ce;
    uint256 private constant BOB_KEY = 0xb0b;
    address private alice;
    address private bob;
    address private carol = address(0xcafe);

    function setUp() public {
        pilot = new NativePaymentPilot();
        alice = vm.addr(ALICE_KEY);
        bob = vm.addr(BOB_KEY);
        vm.deal(alice, 100);
        vm.prank(alice);
        pilot.deposit{value: 100}();
    }

    function payment(address from, address to, uint256 amount, uint256 nonce)
        private view returns (NativePaymentPilot.HubTransfer memory)
    {
        bytes32 asset = pilot.nativeAssetId();
        return NativePaymentPilot.HubTransfer(from, to, asset, amount, 0, asset, nonce, uint64(block.timestamp), 0, 0);
    }

    function sign(NativePaymentPilot.HubTransfer memory transfer, uint256 key) private view returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, pilot.hashTransfer(transfer));
        return abi.encodePacked(r, s, v);
    }

    function testReceivedFundsCanBeSpentAndWithdrawn() public {
        NativePaymentPilot.HubTransfer[] memory transfers = new NativePaymentPilot.HubTransfer[](2);
        bytes[] memory signatures = new bytes[](2);
        transfers[0] = payment(alice, bob, 100, 0);
        transfers[1] = payment(bob, carol, 60, 0);
        signatures[0] = sign(transfers[0], ALICE_KEY);
        signatures[1] = sign(transfers[1], BOB_KEY);

        pilot.settle(transfers, signatures);
        vm.prank(carol);
        pilot.withdraw(60);
        vm.prank(bob);
        pilot.withdraw(40);
        assertEq(address(pilot).balance, 0);
        assertEq(carol.balance, 60);
        assertEq(bob.balance, 40);
        vm.expectRevert(NativePaymentPilot.InvalidPayment.selector);
        pilot.settle(transfers, signatures);
    }

    function testBadSecondPaymentRollsBackFirst() public {
        NativePaymentPilot.HubTransfer[] memory transfers = new NativePaymentPilot.HubTransfer[](2);
        bytes[] memory signatures = new bytes[](2);
        transfers[0] = payment(alice, bob, 100, 0);
        transfers[1] = payment(bob, carol, 60, 0);
        signatures[0] = sign(transfers[0], ALICE_KEY);
        signatures[1] = sign(transfers[1], BOB_KEY);
        transfers[1].to = alice;
        vm.expectRevert(NativePaymentPilot.InvalidSignature.selector);
        pilot.settle(transfers, signatures);
        assertEq(pilot.balanceOf(alice), 100);
        assertEq(pilot.balanceOf(bob), 0);
        assertEq(pilot.nonceOf(alice), 0);
    }
}
