// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {ClaimSettlement} from "../src/ClaimSettlement.sol";

contract ClaimSettlementTest is Test {
    function testBenchmarkRootAndClaims() public {
        ClaimSettlement settlement = new ClaimSettlement();
        vm.deal(address(this), 5050);
        bytes32[256] memory tree;
        for (uint256 i; i < 100; ++i) {
            tree[128 + i] = keccak256(bytes.concat(keccak256(abi.encode(i, address(uint160(1000 + i)), i + 1))));
        }
        for (uint256 i = 127; i > 0; --i) {
            bytes32 a = tree[i * 2];
            bytes32 b = tree[i * 2 + 1];
            tree[i] = a < b ? keccak256(abi.encodePacked(a, b)) : keccak256(abi.encodePacked(b, a));
        }

        uint256 start = gasleft();
        uint256 batchId = settlement.publish{value: 5050}(tree[1]);
        emit log_named_uint("Settlement root publication in-transaction execution gas (not tx cost)", start - gasleft());

        bytes32[] memory proof = new bytes32[](7);
        uint256 claimGas;
        for (uint256 i; i < 100; ++i) {
            uint256 position = 128 + i;
            for (uint256 j; j < 7; ++j) {
                proof[j] = tree[position ^ 1];
                position >>= 1;
            }

            address payable recipient = payable(address(uint160(1000 + i)));
            if (i == 0) {
                vm.expectRevert(ClaimSettlement.InvalidClaim.selector);
                settlement.claim(batchId, i, recipient, i + 2, proof);
            }
            start = gasleft();
            settlement.claim(batchId, i, recipient, i + 1, proof);
            claimGas += start - gasleft();
            assertEq(recipient.balance, i + 1);
        }

        emit log_named_uint("All 100 claims in-transaction execution gas (not tx cost)", claimGas);
        assertEq(address(settlement).balance, 0);
        vm.expectRevert(ClaimSettlement.AlreadyClaimed.selector);
        settlement.claim(batchId, 99, payable(address(uint160(1099))), 100, proof);
    }
}
