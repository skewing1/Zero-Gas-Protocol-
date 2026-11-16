// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {ClaimSettlement} from "../src/ClaimSettlement.sol";

contract ReenteringRecipient {
    ClaimSettlement immutable settlement;
    uint256 immutable batchId;
    bytes32[] private proof;
    bool public attempted;
    bool public blocked;

    constructor(ClaimSettlement _settlement, uint256 _batchId) {
        settlement = _settlement;
        batchId = _batchId;
    }

    function setProof(bytes32[] memory _proof) external {
        proof = _proof;
    }

    receive() external payable {
        attempted = true;
        try settlement.claim(batchId, 0, payable(address(this)), msg.value, proof) {
            blocked = false;
        } catch {
            blocked = true;
        }
    }
}

contract RejectingRecipient {
    receive() external payable {
        revert("reject");
    }
}

contract ClaimSettlementAdversarialTest is Test {
    ClaimSettlement settlement;

    function setUp() public {
        settlement = new ClaimSettlement();
        vm.deal(address(this), 10 ether);
    }

    function leaf(uint256 index, address recipient, uint256 amount) internal pure returns (bytes32) {
        return keccak256(bytes.concat(keccak256(abi.encode(index, recipient, amount))));
    }

    function testPermissionlessClaimPaysCommittedRecipientNotCaller() public {
        address payable recipient = payable(address(0xBEEF));
        uint256 id = settlement.publish{value: 1 ether}(leaf(0, recipient, 1 ether));
        bytes32[] memory proof = new bytes32[](0);
        vm.prank(address(0xCAFE));
        settlement.claim(id, 0, recipient, 1 ether, proof);
        assertEq(recipient.balance, 1 ether);
        assertEq(address(0xCAFE).balance, 0);
        assertEq(address(settlement).balance, 0);
    }

    function testReplayRejectedAndSameLeafIndexIsolatedAcrossBatches() public {
        address payable recipient = payable(address(0xBEEF));
        bytes32 root = leaf(0, recipient, 1 ether);
        uint256 first = settlement.publish{value: 1 ether}(root);
        uint256 second = settlement.publish{value: 1 ether}(root);
        bytes32[] memory proof = new bytes32[](0);
        settlement.claim(first, 0, recipient, 1 ether, proof);
        vm.expectRevert(ClaimSettlement.AlreadyClaimed.selector);
        settlement.claim(first, 0, recipient, 1 ether, proof);
        settlement.claim(second, 0, recipient, 1 ether, proof);
        assertEq(recipient.balance, 2 ether);
    }

    function testInvalidRecipientAndAmountCannotRedirectFunds() public {
        address payable recipient = payable(address(0xBEEF));
        uint256 id = settlement.publish{value: 1 ether}(leaf(0, recipient, 1 ether));
        bytes32[] memory proof = new bytes32[](0);
        vm.expectRevert(ClaimSettlement.InvalidClaim.selector);
        settlement.claim(id, 0, payable(address(0xCAFE)), 1 ether, proof);
        vm.expectRevert(ClaimSettlement.InvalidClaim.selector);
        settlement.claim(id, 0, recipient, 2 ether, proof);
        settlement.claim(id, 0, recipient, 1 ether, proof);
        assertEq(recipient.balance, 1 ether);
    }

    function testRecipientRevertPreservesClaimabilityAndFunds() public {
        RejectingRecipient recipient = new RejectingRecipient();
        uint256 id = settlement.publish{value: 1 ether}(leaf(0, address(recipient), 1 ether));
        bytes32[] memory proof = new bytes32[](0);
        vm.expectRevert(ClaimSettlement.PaymentFailed.selector);
        settlement.claim(id, 0, payable(address(recipient)), 1 ether, proof);
        (, uint256 remaining) = settlement.batches(id);
        assertEq(remaining, 1 ether);
        assertEq(address(settlement).balance, 1 ether);
        vm.expectRevert(ClaimSettlement.PaymentFailed.selector);
        settlement.claim(id, 0, payable(address(recipient)), 1 ether, proof);
    }

    function testReentrantReplayBlockedWhileLegitimateClaimSucceeds() public {
        // A recipient may call back into claim(); the claim bitmap must already be set.
        // Batch ID is 1 because this test uses a fresh settlement instance.
        ReenteringRecipient recipient = new ReenteringRecipient(settlement, 1);
        uint256 id = settlement.publish{value: 1 ether}(leaf(0, address(recipient), 1 ether));
        assertEq(id, 1);
        bytes32[] memory proof = new bytes32[](0);
        recipient.setProof(proof);
        vm.prank(address(0xCAFE));
        settlement.claim(id, 0, payable(address(recipient)), 1 ether, proof);
        assertTrue(recipient.attempted());
        assertTrue(recipient.blocked());
        assertEq(address(recipient).balance, 1 ether);
        assertEq(address(settlement).balance, 0);
    }
}
