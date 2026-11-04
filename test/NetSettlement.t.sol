// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";

/// @dev Execution benchmark only. Both paths pay the same native asset from
/// the same funding account. The net path groups obligations before execution.
contract NetSettlementTest is Test {
    function testNetSettlementDistinctRecipients() public {
        benchmark(100);
    }

    function testNetSettlementFourPaymentsPerRecipient() public {
        benchmark(25);
    }

    function testNetSettlementTenPaymentsPerRecipient() public {
        benchmark(10);
    }

    function benchmark(uint256 recipientCount) internal {
        uint256 paymentCount = 100;
        vm.deal(address(this), paymentCount);
        address payable[] memory recipients = new address payable[](recipientCount);
        uint256[] memory netAmounts = new uint256[](recipientCount);
        for (uint256 i; i < recipientCount; ++i) {
            recipients[i] = payable(address(uint160(0x10000 + i)));
        }
        for (uint256 i; i < paymentCount; ++i) {
            ++netAmounts[i % recipientCount];
        }

        uint256 snapshot = vm.snapshotState();
        uint256 start = gasleft();
        for (uint256 i; i < paymentCount; ++i) {
            pay(recipients[i % recipientCount], 1);
        }
        uint256 directGas = start - gasleft();
        assertBalances(recipients, netAmounts);

        assertTrue(vm.revertToState(snapshot));
        // Reset each account to cold for the second measurement. Both paths
        // keep accounts warm naturally after their first access.
        for (uint256 i; i < recipientCount; ++i) vm.cool(recipients[i]);

        start = gasleft();
        for (uint256 i; i < recipientCount; ++i) {
            pay(recipients[i], netAmounts[i]);
        }
        uint256 netGas = start - gasleft();
        assertBalances(recipients, netAmounts);

        emit log_named_uint("Unique recipients", recipientCount);
        emit log_named_uint("Direct native payout in-transaction execution gas (not tx cost)", directGas);
        emit log_named_uint("Net native payout in-transaction execution gas (not tx cost)", netGas);
    }

    function pay(address payable recipient, uint256 amount) internal {
        (bool success,) = recipient.call{value: amount}("");
        require(success, "payout failed");
    }

    function assertBalances(address payable[] memory recipients, uint256[] memory amounts) internal view {
        for (uint256 i; i < recipients.length; ++i) {
            assertEq(recipients[i].balance, amounts[i]);
        }
        assertEq(address(this).balance, 0);
    }
}
