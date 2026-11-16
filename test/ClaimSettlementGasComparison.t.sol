// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {ClaimSettlement} from "../src/ClaimSettlement.sol";

/// @notice Execution-only gas comparison. Does NOT include intrinsic tx gas,
/// calldata, relayer costs, deployment, L1 data fees, or independent payer setup.
/// Do not use this test to claim 45% all-in savings.
contract ClaimSettlementGasComparisonTest is Test {
    address payable internal alice = payable(address(0xA11CE));
    address payable internal bob = payable(address(0xB0B));

    function _leaf(uint256 index, address recipient, uint256 amount) internal pure returns (bytes32) {
        return keccak256(bytes.concat(keccak256(abi.encode(index, recipient, amount))));
    }

    function _fixture(ClaimSettlement target)
        internal
        returns (ClaimSettlement.ClaimInput[] memory claims)
    {
        bytes32 a = _leaf(0, alice, 2 ether);
        bytes32 b = _leaf(1, bob, 3 ether);
        bytes32 root = a < b
            ? keccak256(abi.encodePacked(a, b))
            : keccak256(abi.encodePacked(b, a));
        uint256 batchId = target.publish{value: 5 ether}(root);
        bytes32[] memory proofA = new bytes32[](1);
        bytes32[] memory proofB = new bytes32[](1);
        proofA[0] = b;
        proofB[0] = a;
        claims = new ClaimSettlement.ClaimInput[](2);
        claims[0] = ClaimSettlement.ClaimInput(batchId, 0, alice, 2 ether, proofA);
        claims[1] = ClaimSettlement.ClaimInput(batchId, 1, bob, 3 ether, proofB);
    }

    function testMeasureSequentialVersusAtomicClaims() public {
        vm.deal(address(this), 20 ether);
        ClaimSettlement sequential = new ClaimSettlement();
        ClaimSettlement batched = new ClaimSettlement();
        ClaimSettlement.ClaimInput[] memory a = _fixture(sequential);
        ClaimSettlement.ClaimInput[] memory b = _fixture(batched);

        uint256 start = gasleft();
        sequential.claim(a[0].batchId, a[0].index, a[0].recipient, a[0].amount, a[0].proof);
        uint256 first = start - gasleft();
        start = gasleft();
        sequential.claim(a[1].batchId, a[1].index, a[1].recipient, a[1].amount, a[1].proof);
        uint256 second = start - gasleft();

        uint256 aliceAfterSequential = alice.balance;
        uint256 bobAfterSequential = bob.balance;
        assertEq(aliceAfterSequential, 2 ether);
        assertEq(bobAfterSequential, 3 ether);
        assertEq(address(sequential).balance, 0);

        start = gasleft();
        batched.claimMany(b);
        uint256 batchGas = start - gasleft();
        assertEq(alice.balance - aliceAfterSequential, 2 ether);
        assertEq(bob.balance - bobAfterSequential, 3 ether);
        assertEq(address(batched).balance, 0);

        emit log_named_uint("two sequential calls execution gas (same test transaction)", first + second);
        emit log_named_uint("one claimMany call execution gas (same test transaction)", batchGas);
        // No threshold assertion: separate real transactions, calldata, and
        // optimized push-batch baseline must be measured using mined receipts.
    }
}
