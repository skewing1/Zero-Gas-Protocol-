// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;
import {Test, Vm} from "forge-std/Test.sol";
import {TransferBench} from "../src/TransferBench.sol";
contract TransferBenchTest is Test {
    function testMeasureAndVerify() public {
        uint256 n = 100;
        address[] memory recipients = new address[](n);
        uint256[] memory amounts = new uint256[](n);
        for (uint256 i; i < n; ++i) {
            recipients[i] = address(uint160(1000 + i));
            amounts[i] = i + 1;
        }
        TransferBench a = new TransferBench(1_000_000);
        TransferBench b = new TransferBench(1_000_000);
        vm.recordLogs();
        uint256 start = gasleft();
        for (uint256 i; i < n; ++i) a.transferOne(recipients[i], amounts[i]);
        uint256 baseline = start - gasleft();
        Vm.Log[] memory baselineLogs = vm.getRecordedLogs();
        vm.recordLogs();
        start = gasleft();
        b.transferBatch(recipients, amounts);
        uint256 optimized = start - gasleft();
        Vm.Log[] memory batchLogs = vm.getRecordedLogs();
        assertEq(balancesTotal(a, recipients), balancesTotal(b, recipients));
        assertEq(a.balances(address(this)), b.balances(address(this)));
        for (uint256 i; i < n; ++i) assertEq(a.balances(recipients[i]), b.balances(recipients[i]));
        assertEq(baselineLogs.length, batchLogs.length);
        for (uint256 i; i < n; ++i) {
            assertEq(baselineLogs[i].topics.length, batchLogs[i].topics.length);
            for (uint256 j; j < baselineLogs[i].topics.length; ++j)
                assertEq(baselineLogs[i].topics[j], batchLogs[i].topics[j]);
            assertEq(baselineLogs[i].data, batchLogs[i].data);
        }
        emit log_named_uint("Baseline execution gas (100 calls)", baseline);
        emit log_named_uint("Batch execution gas (1 call)", optimized);
        assertLt(optimized, baseline);
        emit log_named_uint("Execution gas reduction basis points", (baseline - optimized) * 10000 / baseline);
    }
    function balancesTotal(TransferBench t, address[] memory recipients) internal view returns(uint256 total) {
        for(uint256 i; i < recipients.length; ++i) total += t.balances(recipients[i]);
    }
}
