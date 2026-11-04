// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Test} from "forge-std/Test.sol";
import {Anchor} from "../../src/anchor/Anchor.sol";
import {Checkpoints} from "../../src/anchor/Checkpoint.sol";
import {AttesterVerifier} from "../../src/anchor/AttesterVerifier.sol";
import {MockCanonicalVerifier} from "../../src/anchor/MockCanonicalVerifier.sol";

contract AnchorTest is Test {
    Anchor private anchor;
    AttesterVerifier private verifier;
    uint256 private first = 11;
    uint256 private second = 22;

    function setUp() public {
        anchor = new Anchor();
        address[] memory members = new address[](3);
        members[0] = vm.addr(first);
        members[1] = vm.addr(second);
        members[2] = vm.addr(33);
        verifier = new AttesterVerifier(members, 2, 1 ether);
        for (uint256 i; i < 2; ++i) {
            vm.deal(members[i], 1 ether);
            vm.prank(members[i]);
            verifier.bond{value: 1 ether}();
        }
        if (members[0] > members[1]) (first, second) = (second, first);
    }

    function checkpoint() private pure returns (Checkpoints.Checkpoint memory) {
        return Checkpoints.Checkpoint(31338, address(1), 0, 0, 0, bytes32(uint256(1)),
            bytes32(uint256(2)), 100, bytes32(uint256(3)));
    }

    function signature(uint256 key, Checkpoints.Checkpoint memory cp) private view returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, verifier.hashCheckpoint(cp));
        return abi.encodePacked(r, s, v);
    }

    function testAttestAndVerifySingleLeaf() public {
        Checkpoints.Checkpoint memory cp = checkpoint();
        bytes[] memory signatures = new bytes[](2);
        signatures[0] = signature(first, cp);
        signatures[1] = signature(second, cp);
        bytes memory evidence = abi.encode(signatures);
        anchor.submit(cp, address(verifier), evidence);
        bytes32[] memory proof = new bytes32[](0);
        assertTrue(anchor.verifyReceipt(31338, address(1), address(verifier), 0, cp.receiptsRoot, proof));
        assertFalse(anchor.verifyReceipt(31337, address(1), address(verifier), 0, cp.receiptsRoot, proof));
        assertFalse(anchor.verifyReceipt(31338, address(1), address(verifier), 1, cp.receiptsRoot, proof));
        vm.expectRevert(Anchor.InvalidCheckpoint.selector);
        anchor.submit(cp, address(verifier), evidence);
    }

    function testSlashDuringUnbonding() public {
        Checkpoints.Checkpoint memory a = checkpoint();
        Checkpoints.Checkpoint memory b = checkpoint();
        b.receiptsRoot = bytes32(uint256(10));
        bytes memory sigA = signature(first, a);
        bytes memory sigB = signature(first, b);
        address signer = vm.addr(first);
        vm.prank(signer);
        verifier.beginUnbonding();
        verifier.slashEquivocation(a, sigA, b, sigB);
        assertEq(verifier.rewards(address(this)), 0.5 ether);
        vm.warp(block.timestamp + 7 days);
        vm.prank(signer);
        vm.expectRevert(AttesterVerifier.InvalidMember.selector);
        verifier.withdrawBond();
    }

    function testMockDelayOnly() public {
        MockCanonicalVerifier mock = new MockCanonicalVerifier(0);
        Checkpoints.Checkpoint memory cp = checkpoint();
        mock.announce(cp);
        assertFalse(mock.verify(cp, ""));
        vm.warp(block.timestamp + 7 days);
        assertTrue(mock.verify(cp, ""));
    }
}
