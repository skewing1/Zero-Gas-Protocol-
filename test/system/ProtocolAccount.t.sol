// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Test} from "forge-std/Test.sol";
import {PaymentIntents} from "../../src/system/Intent.sol";
import {ProtocolAccount} from "../../src/system/ProtocolAccount.sol";
import {Settler} from "../../src/system/Settler.sol";
import {BenchToken} from "../mocks/BenchToken.sol";

contract SlotWriter {
    function overwrite() external {
        for (uint256 slot; slot <= 10; ++slot) {
            assembly ("memory-safe") { sstore(slot, 123) }
        }
    }
}

contract CallbackPayee {
    bool public rejected;

    function arm(ProtocolAccount account, PaymentIntents.Intent calldata intent, bytes calldata signature) external {
        payload = abi.encodeCall(ProtocolAccount.executeIntent, (intent, signature, 0, address(this)));
        payer = address(account);
    }

    address private payer;
    bytes private payload;

    receive() external payable {
        (bool success,) = payer.call(payload);
        rejected = !success;
    }
}

contract ProtocolAccountTest is Test {
    uint256 private constant KEY = 0xa11ce;
    uint256 private constant SECOND_KEY = 0xb0b;
    address private constant PAYEE = address(0x10001);
    address private constant RELAYER = address(0x10002);
    ProtocolAccount private implementation;
    ProtocolAccount private payer;
    Settler private settler;

    event IntentExecuted(
        bytes32 indexed intentHash, address indexed payee, address asset, uint256 amount, uint256 fee,
        address indexed relayer, bytes32 serviceId, bytes32 manifestHash
    );
    event Skipped(address indexed account, bytes32 indexed intentHash, bytes revertData);

    function setUp() public {
        vm.chainId(31337);
        implementation = new ProtocolAccount();
        settler = new Settler(implementation);
        payer = ProtocolAccount(payable(vm.addr(KEY)));
        vm.attachDelegation(vm.signDelegation(address(implementation), KEY));
        vm.deal(address(payer), 1000);
    }

    function payment(address asset, uint192 lane, uint64 seq) private view returns (PaymentIntents.Intent memory) {
        return PaymentIntents.Intent(PAYEE, asset, 100, 10, bytes32("service"), bytes32("manifest"), lane, seq,
            uint64(block.timestamp + 1 days));
    }

    function sign(PaymentIntents.Intent memory intent) private view returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(KEY, payer.hashIntent(intent));
        return abi.encodePacked(r, s, v);
    }

    function submit(PaymentIntents.Intent memory intent, bytes memory sig, uint256 fee) private {
        address[] memory accounts = new address[](1);
        PaymentIntents.Intent[] memory intents = new PaymentIntents.Intent[](1);
        bytes[] memory signatures = new bytes[](1);
        uint256[] memory fees = new uint256[](1);
        (accounts[0], intents[0], signatures[0], fees[0]) = (address(payer), intent, sig, fee);
        vm.prank(RELAYER);
        settler.settleBatch(accounts, intents, signatures, fees);
    }

    function testNativeReceiptAndReplay() public {
        PaymentIntents.Intent memory intent = payment(address(0), 1, 0);
        bytes memory sig = sign(intent);
        bytes32 digest = payer.hashIntent(intent);
        vm.expectEmit(true, true, true, true, address(payer));
        emit IntentExecuted(digest, PAYEE, address(0), 100, 10, RELAYER, intent.serviceId, intent.manifestHash);
        submit(intent, sig, 10);
        assertEq(address(payer).balance, 890);
        assertEq(PAYEE.balance, 100);
        assertEq(RELAYER.balance, 10);
        bytes32 accumulator = keccak256(abi.encode(bytes32(0), address(payer), digest, block.number));
        assertEq(settler.receiptAccumulator(), accumulator);
        vm.expectRevert(ProtocolAccount.InvalidNonce.selector);
        payer.executeIntent(intent, sig, 0, address(this));
        vm.expectEmit(true, true, false, true, address(settler));
        emit Skipped(address(payer), digest, abi.encodeWithSelector(ProtocolAccount.InvalidNonce.selector));
        submit(intent, sig, 10);
        assertEq(settler.receiptAccumulator(), accumulator);
    }

    function testTokenPaysDirectlyAndFeeOnlyGoesToSubmittingRelayer() public {
        BenchToken token = new BenchToken();
        token.transfer(address(payer), 1000);
        PaymentIntents.Intent memory intent = payment(address(token), 1, 0);
        bytes32 digest = payer.hashIntent(intent);
        bytes memory sig = sign(intent);
        vm.expectEmit(true, true, true, true, address(payer));
        emit IntentExecuted(digest, PAYEE, address(token), 100, 5, RELAYER, intent.serviceId,
            intent.manifestHash);
        submit(intent, sig, 5);
        assertEq(token.balanceOf(address(payer)), 895);
        assertEq(token.balanceOf(PAYEE), 100);
        assertEq(token.balanceOf(RELAYER), 5);
        assertEq(token.balanceOf(address(settler)), 0);
    }

    function testCrossDomainReplay() public {
        PaymentIntents.Intent memory intent = payment(address(0), 1, 0);
        bytes memory sig = sign(intent);
        vm.chainId(31338);
        vm.expectRevert(ProtocolAccount.Unauthorized.selector);
        payer.executeIntent(intent, sig, 0, RELAYER);
        vm.chainId(31337);
        ProtocolAccount second = ProtocolAccount(payable(vm.addr(SECOND_KEY)));
        vm.attachDelegation(vm.signDelegation(address(implementation), SECOND_KEY));
        vm.expectRevert(ProtocolAccount.Unauthorized.selector);
        second.executeIntent(intent, sig, 0, RELAYER);
    }

    function testLanesCancellationFeeCapAndExpiry() public {
        PaymentIntents.Intent memory first = payment(address(0), 1, 0);
        PaymentIntents.Intent memory second = payment(address(0), 2, 0);
        PaymentIntents.Intent memory future = payment(address(0), 2, 1);
        bytes memory futureSig = sign(future);
        bytes memory firstSig = sign(first);
        bytes memory secondSig = sign(second);
        vm.expectRevert(ProtocolAccount.InvalidNonce.selector);
        payer.executeIntent(future, futureSig, 0, PAYEE);
        vm.expectRevert(ProtocolAccount.FeeOverCap.selector);
        payer.executeIntent(first, firstSig, 11, RELAYER);
        vm.prank(PAYEE);
        payer.executeIntent(second, secondSig, 0, PAYEE);
        assertEq(payer.nextNonce(2), 1);
        assertEq(payer.nextNonce(1), 0);
        vm.prank(address(payer));
        payer.cancelNonceKey(1);
        vm.expectRevert(ProtocolAccount.InvalidNonce.selector);
        payer.executeIntent(first, firstSig, 0, PAYEE);
        vm.warp(future.deadline + 1);
        vm.expectRevert(ProtocolAccount.Expired.selector);
        payer.executeIntent(future, futureSig, 0, PAYEE);
    }

    function testRevocationAndRedelegationPreserveNonce() public {
        PaymentIntents.Intent memory first = payment(address(0), 1, 0);
        submit(first, sign(first), 0);
        PaymentIntents.Intent memory pending = payment(address(0), 1, 1);
        bytes memory sig = sign(pending);
        bytes32 prior = settler.receiptAccumulator();
        vm.attachDelegation(vm.signDelegation(address(0), KEY));
        submit(pending, sig, 0);
        assertEq(settler.receiptAccumulator(), prior);
        vm.prank(address(payer));
        (bool spent,) = payable(PAYEE).call{value: 1}("");
        assertTrue(spent);
        SlotWriter writer = new SlotWriter();
        vm.attachDelegation(vm.signDelegation(address(writer), KEY));
        SlotWriter(address(payer)).overwrite();
        vm.attachDelegation(vm.signDelegation(address(implementation), KEY));
        assertEq(payer.nextNonce(1), 1);
        submit(pending, sig, 0);
        assertEq(payer.nextNonce(1), 2);
    }

    function testReentrantPayeeCannotRepeatExecution() public {
        CallbackPayee callback = new CallbackPayee();
        PaymentIntents.Intent memory intent = payment(address(0), 1, 0);
        intent.payee = address(callback);
        bytes memory sig = sign(intent);
        callback.arm(payer, intent, sig);
        submit(intent, sig, 0);
        assertTrue(callback.rejected());
        assertEq(address(callback).balance, 100);
        assertEq(payer.nextNonce(1), 1);
    }
}
