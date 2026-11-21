// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {DelegatedBatchAccount} from "../src/DelegatedBatchAccount.sol";

interface VmGasProbe {
    function addr(uint256 key) external returns (address);
    function sign(uint256 key, bytes32 digest) external returns (uint8, bytes32, bytes32);
    function etch(address target, bytes calldata code) external;
    function deal(address who, uint256 newBalance) external;
    function startPrank(address sender) external;
    function stopPrank() external;
    function prank(address sender) external;
}

/// @notice Local EVM *execution-only* comparison. NOT type-4 receipt evidence or an all-in fee benchmark.
/// @dev A Solidity test cannot account for intrinsic transaction gas, authorization-list costs,
///      actual relayer network payments, L1 data fees, deployment, or cross-chain settlement.
///      Use real Prague type-4 receipts and verified balance snapshots for economic conclusions.
contract DelegatedBatchGasProbeTest {
    VmGasProbe private constant vm = VmGasProbe(address(uint160(uint256(keccak256("hevm cheat code")))));
    uint256 private constant DELEGATED_KEY = 0xA11CE;
    uint256 private constant BASELINE_KEY = 0xB0B;
    uint256 private constant PAYOUT = 0.01 ether;
    uint256 private constant RELAYER_FEE = 0.001 ether;
    address private constant CANDIDATE_RELAYER = address(0xBEEF);
    address private constant BASELINE_RELAYER = address(0xFEE1);

    event ExecutionGasProbe(
        uint256 indexed recipientCount,
        uint256 baselineExecutionGas,
        uint256 candidateExecutionGas,
        uint256 baselineTransactionsRequired,
        uint256 candidateTransactionsRequired
    );

    function testExecutionProbeTwoRecipients() public { _probe(2); }
    function testExecutionProbeEightRecipients() public { _probe(8); }
    function testExecutionProbeSixteenRecipients() public { _probe(16); }

    function _probe(uint256 count) internal {
        address delegatedOwner = vm.addr(DELEGATED_KEY);
        address baselineOwner = vm.addr(BASELINE_KEY);
        DelegatedBatchAccount implementation = new DelegatedBatchAccount();
        vm.etch(delegatedOwner, address(implementation).code);
        DelegatedBatchAccount account = DelegatedBatchAccount(delegatedOwner);
        vm.deal(delegatedOwner, 100 ether);
        vm.deal(baselineOwner, 100 ether);
        vm.deal(CANDIDATE_RELAYER, 0);
        vm.deal(BASELINE_RELAYER, 0);

        address[] memory recipients = new address[](count);
        uint256[] memory amounts = new uint256[](count);
        for (uint256 i; i < count; ++i) {
            recipients[i] = address(uint160(0x100000 + i));
            amounts[i] = PAYOUT;
            vm.deal(recipients[i], 0);
        }

        uint256 deadline = block.timestamp + 1 hours;
        bytes32 digest = account.intentDigest(recipients, amounts, 0, deadline, RELAYER_FEE);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(DELEGATED_KEY, digest);
        bytes memory signature = abi.encodePacked(r, s, v);

        // Baseline: independent ordinary EOA payments, plus an equivalent relayer-fee transfer.
        // gasleft() excludes each real transaction's intrinsic gas and network-specific fees.
        vm.startPrank(baselineOwner);
        uint256 baselineStart = gasleft();
        for (uint256 i; i < count; ++i) {
            (bool ok,) = payable(recipients[i]).call{value: amounts[i]}("");
            require(ok, "baseline transfer");
        }
        (bool feeOk,) = payable(BASELINE_RELAYER).call{value: RELAYER_FEE}("");
        require(feeOk, "baseline fee");
        uint256 baselineGas = baselineStart - gasleft();
        vm.stopPrank();

        for (uint256 i; i < count; ++i) {
            require(recipients[i].balance == PAYOUT, "baseline recipient");
        }
        require(BASELINE_RELAYER.balance == RELAYER_FEE, "baseline relayer");

        vm.prank(CANDIDATE_RELAYER);
        uint256 candidateStart = gasleft();
        account.executeBatch(recipients, amounts, 0, deadline, RELAYER_FEE, signature);
        uint256 candidateGas = candidateStart - gasleft();

        for (uint256 i; i < count; ++i) {
            require(recipients[i].balance == 2 * PAYOUT, "candidate recipient delta");
        }
        require(CANDIDATE_RELAYER.balance == RELAYER_FEE, "candidate relayer");
        require(baselineOwner.balance == delegatedOwner.balance, "payer debit mismatch");
        require(account.nonce() == 1, "candidate nonce");

        emit ExecutionGasProbe(count, baselineGas, candidateGas, count + 1, 1);
    }
}
