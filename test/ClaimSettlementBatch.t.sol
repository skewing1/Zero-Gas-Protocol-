// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {ClaimSettlement} from "../src/ClaimSettlement.sol";

contract ClaimSettlementBatchTest is Test {
    ClaimSettlement internal settlement;
    address payable internal alice = payable(address(0xA11CE));
    address payable internal bob = payable(address(0xB0B));

    function setUp() public {
        settlement = new ClaimSettlement();
        vm.deal(address(this), 100 ether);
    }

    function _leaf(uint256 index, address recipient, uint256 amount) internal pure returns (bytes32) {
        return keccak256(bytes.concat(keccak256(abi.encode(index, recipient, amount))));
    }

    function _fixture() internal returns (uint256 id, ClaimSettlement.ClaimInput[] memory inputs) {
        bytes32 a = _leaf(0, alice, 2 ether);
        bytes32 b = _leaf(1, bob, 3 ether);
        bytes32 root = a < b ? keccak256(abi.encodePacked(a, b)) : keccak256(abi.encodePacked(b, a));
        id = settlement.publish{value: 5 ether}(root);
        inputs = new ClaimSettlement.ClaimInput[](2);
        bytes32[] memory pa = new bytes32[](1);
        bytes32[] memory pb = new bytes32[](1);
        pa[0] = b;
        pb[0] = a;
        inputs[0] = ClaimSettlement.ClaimInput(id, 0, alice, 2 ether, pa);
        inputs[1] = ClaimSettlement.ClaimInput(id, 1, bob, 3 ether, pb);
    }

    function testPermissionlessBatchPaysBothAndRejectsReplay() public {
        (, ClaimSettlement.ClaimInput[] memory inputs) = _fixture();
        vm.prank(address(0xCAFE));
        settlement.claimMany(inputs);
        assertEq(alice.balance, 2 ether);
        assertEq(bob.balance, 3 ether);
        assertEq(address(settlement).balance, 0);
        vm.expectRevert(ClaimSettlement.AlreadyClaimed.selector);
        settlement.claimMany(inputs);
    }

    function testInvalidSecondProofRevertsWholeBatch() public {
        (, ClaimSettlement.ClaimInput[] memory inputs) = _fixture();
        inputs[1].amount = 4 ether;
        vm.expectRevert(ClaimSettlement.InvalidClaim.selector);
        settlement.claimMany(inputs);
        assertEq(alice.balance, 0);
        assertEq(bob.balance, 0);
        assertEq(address(settlement).balance, 5 ether);
        inputs[1].amount = 3 ether;
        settlement.claimMany(inputs);
        assertEq(alice.balance, 2 ether);
        assertEq(bob.balance, 3 ether);
    }

    function testDuplicateIndexRevertsAtomically() public {
        (, ClaimSettlement.ClaimInput[] memory inputs) = _fixture();
        inputs[1] = inputs[0];
        vm.expectRevert(ClaimSettlement.AlreadyClaimed.selector);
        settlement.claimMany(inputs);
        assertEq(alice.balance, 0);
        assertEq(address(settlement).balance, 5 ether);
    }

    function testEmptyBatchRejected() public {
        ClaimSettlement.ClaimInput[] memory empty = new ClaimSettlement.ClaimInput[](0);
        vm.expectRevert(ClaimSettlement.EmptyClaims.selector);
        settlement.claimMany(empty);
    }
}
