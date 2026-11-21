// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {DelegatedBatchAccount} from "../src/DelegatedBatchAccount.sol";

interface VmIsolatedProbe {
    function addr(uint256) external returns (address);
    function sign(uint256, bytes32) external returns (uint8, bytes32, bytes32);
    function etch(address, bytes calldata) external;
    function deal(address, uint256) external;
    function prank(address) external;
    function startPrank(address) external;
    function stopPrank() external;
}

/// @notice Each baseline/candidate is a DIFFERENT Foundry test transaction.
/// @dev Avoids the earlier combined probe's warmed recipient accounts, dirty storage,
///      and cumulative recipient balances. Still NOT mined type-4 receipts or all-in fees.
contract IsolatedDelegatedBatchGasProbeTest {
    VmIsolatedProbe private constant vm = VmIsolatedProbe(address(uint160(uint256(keccak256("hevm cheat code")))));
    uint256 private constant KEY = 0xA11CE;
    uint256 private constant BASE_KEY = 0xB0B;
    uint256 private constant PAYOUT = 0.01 ether;
    uint256 private constant FEE = 0.001 ether;
    address private constant RELAYER = address(0xBEEF);
    event IsolatedExecutionGas(string path, uint256 recipients, uint256 gasUsed, uint256 modeledTransactions);

    function testBaseline2() public { _baseline(2); }
    function testBaseline8() public { _baseline(8); }
    function testBaseline16() public { _baseline(16); }
    function testCandidate2() public { _candidate(2); }
    function testCandidate8() public { _candidate(8); }
    function testCandidate16() public { _candidate(16); }

    function _recipients(uint256 count) private pure returns (address[] memory a, uint256[] memory v) {
        a = new address[](count);
        v = new uint256[](count);
        for (uint256 i; i < count; ++i) {
            a[i] = address(uint160(0x100000 + i));
            v[i] = PAYOUT;
        }
    }

    function _baseline(uint256 count) private {
        address payer = vm.addr(BASE_KEY);
        vm.deal(payer, 100 ether);
        vm.deal(RELAYER, 0);
        (address[] memory recipients, uint256[] memory amounts) = _recipients(count);
        uint256 beforeBalance = payer.balance;
        vm.startPrank(payer);
        uint256 start = gasleft();
        for (uint256 i; i < count; ++i) {
            (bool ok,) = payable(recipients[i]).call{value: amounts[i]}("");
            require(ok, "baseline transfer");
        }
        (bool feeOk,) = payable(RELAYER).call{value: FEE}("");
        require(feeOk, "baseline fee");
        uint256 used = start - gasleft();
        vm.stopPrank();
        for (uint256 i; i < count; ++i) require(recipients[i].balance == PAYOUT, "baseline recipient");
        require(RELAYER.balance == FEE, "baseline fee balance");
        require(beforeBalance - payer.balance == count * PAYOUT + FEE, "baseline debit");
        emit IsolatedExecutionGas("baseline", count, used, count + 1);
    }

    function _candidate(uint256 count) private {
        address payer = vm.addr(KEY);
        DelegatedBatchAccount implementation = new DelegatedBatchAccount();
        vm.etch(payer, address(implementation).code);
        DelegatedBatchAccount account = DelegatedBatchAccount(payer);
        vm.deal(payer, 100 ether);
        vm.deal(RELAYER, 0);
        (address[] memory recipients, uint256[] memory amounts) = _recipients(count);
        uint256 deadline = block.timestamp + 1 hours;
        bytes32 digest = account.intentDigest(recipients, amounts, 0, deadline, FEE);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(KEY, digest);
        bytes memory sig = abi.encodePacked(r, s, v);
        uint256 beforeBalance = payer.balance;
        vm.prank(RELAYER);
        uint256 start = gasleft();
        account.executeBatch(recipients, amounts, 0, deadline, FEE, sig);
        uint256 used = start - gasleft();
        for (uint256 i; i < count; ++i) require(recipients[i].balance == PAYOUT, "candidate recipient");
        require(RELAYER.balance == FEE, "candidate fee balance");
        require(beforeBalance - payer.balance == count * PAYOUT + FEE, "candidate debit");
        require(account.nonce() == 1, "nonce");
        emit IsolatedExecutionGas("candidate", count, used, 1);
    }
}
