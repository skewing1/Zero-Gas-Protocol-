// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {ClaimSettlement} from "../src/ClaimSettlement.sol";
import {BatchPayout} from "../src/BatchPayout.sol";

/// @notice Diagnostic gas comparison with equal native-asset recipient outcomes.
/// @dev forge test --match-contract ClaimVersusPushGasTest -vv
/// @dev Not an all-in benchmark: contract deployment, intrinsic tx gas, relayer
/// compensation, L1 DA, and independent-payer setup require receipt measurements.
contract ClaimVersusPushGasTest is Test {
    address payable internal alice = payable(address(0xA11CE));
    address payable internal bob = payable(address(0xB0B));

    function _leaf(uint256 index, address recipient, uint256 amount) internal pure returns (bytes32) {
        return keccak256(bytes.concat(keccak256(abi.encode(index, recipient, amount))));
    }

    function testPushBatchVersusPublishAndClaimMany() public {
        vm.deal(address(this), 20 ether);
        BatchPayout push = new BatchPayout();
        ClaimSettlement claim = new ClaimSettlement();

        address[] memory recipients = new address[](2);
        uint256[] memory amounts = new uint256[](2);
        recipients[0] = alice;
        recipients[1] = bob;
        amounts[0] = 2 ether;
        amounts[1] = 3 ether;

        uint256 start = gasleft();
        push.payNative{value: 5 ether}(recipients, amounts);
        uint256 pushGas = start - gasleft();
        assertEq(alice.balance, 2 ether);
        assertEq(bob.balance, 3 ether);
        assertEq(address(push).balance, 0);

        bytes32 leafA = _leaf(0, alice, 2 ether);
        bytes32 leafB = _leaf(1, bob, 3 ether);
        bytes32 root = leafA < leafB
            ? keccak256(abi.encodePacked(leafA, leafB))
            : keccak256(abi.encodePacked(leafB, leafA));

        start = gasleft();
        uint256 batchId = claim.publish{value: 5 ether}(root);
        uint256 publishGas = start - gasleft();

        ClaimSettlement.ClaimInput[] memory claims = new ClaimSettlement.ClaimInput[](2);
        bytes32[] memory proofA = new bytes32[](1);
        bytes32[] memory proofB = new bytes32[](1);
        proofA[0] = leafB;
        proofB[0] = leafA;
        claims[0] = ClaimSettlement.ClaimInput(batchId, 0, alice, 2 ether, proofA);
        claims[1] = ClaimSettlement.ClaimInput(batchId, 1, bob, 3 ether, proofB);

        vm.prank(address(0xCAFE));
        start = gasleft();
        claim.claimMany(claims);
        uint256 claimGas = start - gasleft();

        assertEq(alice.balance, 4 ether);
        assertEq(bob.balance, 6 ether);
        assertEq(address(claim).balance, 0);
        (, uint256 remaining) = claim.batches(batchId);
        assertEq(remaining, 0);

        emit log_named_uint("optimized direct push execution gas", pushGas);
        emit log_named_uint("Merkle publish execution gas", publishGas);
        emit log_named_uint("Merkle claimMany execution gas", claimGas);
        emit log_named_uint("Merkle publish plus claimMany execution gas", publishGas + claimGas);
        // Do not assert a savings threshold: real receipt-based equivalent
        // transactions and full operating expenses are the authoritative gate.
    }
}
