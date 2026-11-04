// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {Test} from "forge-std/Test.sol";
import {EpochAccount} from "../../src/experimental/EpochAccount.sol";
import {EpochSettler} from "../../src/experimental/EpochSettler.sol";
import {ProtocolAccount} from "../../src/system/ProtocolAccount.sol";
import {BenchToken} from "../mocks/BenchToken.sol";

contract EpochCallback {
    address public payer;
    bytes public payload;
    bool public rejected;
    function arm(address target, bytes memory data) external { payer = target; payload = data; }
    receive() external payable { (bool ok,) = payer.call(payload); rejected = !ok; }
}
contract RejectEpochPayment { receive() external payable { revert(); } }

contract EpochAccountTest is Test {
    uint256 constant KEY = 0xa11ce;
    address constant BOB = address(0xb0b);
    address constant CAROL = address(0xca401);
    address constant RELAYER = address(0xfee);
    EpochAccount account;
    EpochAccount implementation;
    EpochSettler settler;
    function setUp() public {
        vm.chainId(31337);
        implementation = new EpochAccount();
        account = EpochAccount(payable(vm.addr(KEY)));
        vm.attachDelegation(vm.signDelegation(address(implementation), KEY));
        vm.deal(address(account), 100 ether);
        settler = new EpochSettler(implementation);
    }
    function make(address asset, bytes memory data, address[] memory to) internal view returns (EpochAccount.Epoch memory e) {
        e = EpochAccount.Epoch(asset, keccak256(abi.encode(to)), keccak256(data), 10, 0, 0, uint64(block.timestamp + 100));
    }
    function sign(EpochAccount.Epoch memory e) internal view returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(KEY, account.hashEpoch(e));
        return abi.encodePacked(r,s,v);
    }
    function recipients() internal pure returns (address[] memory to) {
        to = new address[](2); to[0] = BOB; to[1] = CAROL;
    }
    function testFuzzPaymentConservationAndReplay(uint64 a, uint64 b, uint64 c) public {
        vm.assume(a > 0 && b > 0 && c > 0);
        bytes memory data = abi.encodePacked(uint8(0), a, uint8(1), b, uint8(0), c);
        address[] memory to = recipients();
        EpochAccount.Epoch memory e = make(address(0), data, to);
        bytes memory sig = sign(e);
        uint256 beforeBalance = address(account).balance;
        account.executeEpoch(e, to, data, sig, 7, RELAYER);
        assertEq(BOB.balance, uint256(a) + c); assertEq(CAROL.balance, b);
        assertEq(RELAYER.balance, 7);
        assertEq(address(account).balance, beforeBalance - uint256(a) - b - c - 7);
        assertEq(account.nextNonce(0), 1);
        vm.expectRevert(ProtocolAccount.InvalidNonce.selector);
        account.executeEpoch(e, to, data, sig, 0, RELAYER);
    }
    function testTokenAndMixedBatch() public {
        BenchToken token = new BenchToken(); token.transfer(address(account), 100);
        address[] memory to = recipients();
        bytes memory data = abi.encodePacked(uint8(0), uint64(20), uint8(1), uint64(30));
        EpochAccount.Epoch memory e = make(address(token), data, to);
        EpochSettler.Submission[] memory batch = new EpochSettler.Submission[](2);
        batch[0] = EpochSettler.Submission(address(account), e, to, data, sign(e), 5);
        batch[1] = batch[0];
        vm.prank(RELAYER); settler.settle(batch);
        assertEq(token.balanceOf(BOB), 20); assertEq(token.balanceOf(CAROL), 30);
        assertEq(token.balanceOf(RELAYER), 5); assertEq(token.balanceOf(address(account)), 45);
        assertEq(settler.receiptAccumulator(), keccak256(abi.encode(bytes32(0), address(account), account.hashEpoch(e), block.number)));
        assertEq(address(settler).balance, 0);
    }
    function testCommitmentDomainFeeExpiryAndCancel() public {
        address[] memory to = recipients();
        bytes memory data = abi.encodePacked(uint8(0), uint64(20));
        EpochAccount.Epoch memory e = make(address(0), data, to);
        bytes memory sig = sign(e);
        vm.expectRevert(EpochAccount.CommitmentMismatch.selector);
        account.executeEpoch(e, to, abi.encodePacked(uint8(0), uint64(21)), sig, 0, RELAYER);
        vm.expectRevert(ProtocolAccount.FeeOverCap.selector);
        account.executeEpoch(e, to, data, sig, 11, RELAYER);
        vm.chainId(31338);
        vm.expectRevert(ProtocolAccount.Unauthorized.selector);
        account.executeEpoch(e, to, data, sig, 0, RELAYER);
        vm.chainId(31337);
        vm.warp(e.deadline + 1);
        vm.expectRevert(ProtocolAccount.Expired.selector);
        account.executeEpoch(e, to, data, sig, 0, RELAYER);
        vm.warp(e.deadline);
        vm.prank(address(account)); account.cancelNonceKey(0);
        vm.expectRevert(ProtocolAccount.InvalidNonce.selector);
        account.executeEpoch(e, to, data, sig, 0, RELAYER);
    }
    function testMalformedDataDoesNotConsumeNonce() public {
        address[] memory to = recipients();
        bytes[3] memory bad = [bytes(hex"00"), abi.encodePacked(uint8(2), uint64(1)), abi.encodePacked(uint8(0), uint64(0))];
        for (uint256 n; n < bad.length; ++n) {
            EpochAccount.Epoch memory e = make(address(0), bad[n], to);
            bytes memory sig = sign(e);
            vm.expectRevert(EpochAccount.InvalidEncoding.selector);
            account.executeEpoch(e, to, bad[n], sig, 0, RELAYER);
            assertEq(account.nextNonce(0), 0);
        }
    }
    function testRejectedPayoutRollsBackAllPayouts() public {
        address[] memory to = recipients(); to[1] = address(new RejectEpochPayment());
        bytes memory data = abi.encodePacked(uint8(0), uint64(20), uint8(1), uint64(30));
        EpochAccount.Epoch memory e = make(address(0), data, to); bytes memory sig = sign(e);
        vm.expectRevert(ProtocolAccount.PaymentFailed.selector);
        account.executeEpoch(e, to, data, sig, 0, RELAYER);
        assertEq(BOB.balance, 0); assertEq(account.nextNonce(0), 0);
    }
    function testCallbackCannotReplay() public {
        EpochCallback callback = new EpochCallback();
        address[] memory to = new address[](1); to[0] = address(callback);
        bytes memory data = abi.encodePacked(uint8(0), uint64(20));
        EpochAccount.Epoch memory e = make(address(0), data, to); bytes memory sig = sign(e);
        callback.arm(address(account), abi.encodeCall(EpochAccount.executeEpoch, (e,to,data,sig,0,RELAYER)));
        account.executeEpoch(e,to,data,sig,0,RELAYER);
        assertTrue(callback.rejected()); assertEq(address(callback).balance, 20);
    }
    function testCrossAccountAndRecipientTampering() public {
        address[] memory to = recipients();
        bytes memory data = abi.encodePacked(uint8(0), uint64(20));
        EpochAccount.Epoch memory e = make(address(0), data, to); bytes memory sig = sign(e);
        EpochAccount second = EpochAccount(payable(vm.addr(0xb0b)));
        vm.attachDelegation(vm.signDelegation(address(implementation), 0xb0b));
        vm.expectRevert(ProtocolAccount.Unauthorized.selector);
        second.executeEpoch(e,to,data,sig,0,RELAYER);
        to[0] = RELAYER;
        vm.expectRevert(EpochAccount.CommitmentMismatch.selector);
        account.executeEpoch(e,to,data,sig,0,RELAYER);
    }
    function testRevokedDelegationCannotRecordEpoch() public {
        address[] memory to = recipients();
        bytes memory data = abi.encodePacked(uint8(0), uint64(20));
        EpochAccount.Epoch memory e = make(address(0), data, to);
        EpochSettler.Submission[] memory batch = new EpochSettler.Submission[](1);
        batch[0] = EpochSettler.Submission(address(account), e, to, data, sign(e), 0);
        vm.attachDelegation(vm.signDelegation(address(0), KEY));
        settler.settle(batch);
        assertEq(settler.receiptAccumulator(), bytes32(0));
        assertEq(address(account).balance, 100 ether); assertEq(BOB.balance, 0);
    }

}
