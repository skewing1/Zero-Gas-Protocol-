// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {SignedPayout7702} from "../src/SignedPayout7702.sol";

/// @dev vm.etch models execution at an EOA address. It does NOT exercise an
/// EIP-7702 authorization tuple, Prague transaction, or real relayer receipt.
contract SignedPayout7702Test is Test {
    uint256 internal constant OWNER_KEY = 0xA11CE;
    address internal owner;
    address payable internal recipient = payable(address(0xB0B));
    SignedPayout7702 internal account;

    function setUp() public {
        owner = vm.addr(OWNER_KEY);
        SignedPayout7702 implementation = new SignedPayout7702();
        vm.etch(owner, address(implementation).code);
        account = SignedPayout7702(payable(owner));
        vm.deal(owner, 10 ether);
    }

    function _payout(uint256 n) internal view returns (SignedPayout7702.Payout memory) {
        return SignedPayout7702.Payout(address(0), recipient, 1 ether, n, block.timestamp + 100);
    }

    function _sign(SignedPayout7702.Payout memory p) internal returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(OWNER_KEY, account.digest(p));
        return abi.encodePacked(r, s, v);
    }

    function testPermissionlessRelayAndReplayRejection() public {
        SignedPayout7702.Payout memory p = _payout(0);
        bytes memory sig = _sign(p);
        vm.prank(address(0xCAFE));
        account.execute(p, sig);
        assertEq(recipient.balance, 1 ether);
        assertEq(owner.balance, 9 ether);
        assertEq(account.nonce(), 1);
        vm.expectRevert(SignedPayout7702.InvalidNonce.selector);
        account.execute(p, sig);
    }

    function testInvalidSignerCannotSpend() public {
        SignedPayout7702.Payout memory p = _payout(0);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(0xBAD, account.digest(p));
        vm.expectRevert(SignedPayout7702.InvalidSignature.selector);
        account.execute(p, abi.encodePacked(r, s, v));
        assertEq(account.nonce(), 0);
    }

    function testCrossChainReplayRejected() public {
        SignedPayout7702.Payout memory p = _payout(0);
        bytes memory sig = _sign(p);
        vm.chainId(block.chainid + 1);
        vm.expectRevert(SignedPayout7702.InvalidSignature.selector);
        account.execute(p, sig);
        assertEq(account.nonce(), 0);
    }

    function testExpiryAndFailedPaymentDoNotConsumeNonce() public {
        SignedPayout7702.Payout memory p = _payout(0);
        bytes memory sig = _sign(p);
        vm.warp(p.deadline + 1);
        vm.expectRevert(SignedPayout7702.Expired.selector);
        account.execute(p, sig);
        assertEq(account.nonce(), 0);

        p = _payout(0);
        p.amount = 100 ether;
        sig = _sign(p);
        vm.expectRevert(SignedPayout7702.TransferFailed.selector);
        account.execute(p, sig);
        assertEq(account.nonce(), 0);
    }

    function testWrongRecipientInvalidatesSignature() public {
        SignedPayout7702.Payout memory p = _payout(0);
        bytes memory sig = _sign(p);
        p.recipient = payable(address(0xDEAD));
        vm.expectRevert(SignedPayout7702.InvalidSignature.selector);
        account.execute(p, sig);
    }

    function testNoAttachedValue() public {
        SignedPayout7702.Payout memory p = _payout(0);
        vm.deal(address(this), 1 ether);
        bytes memory signature = _sign(p);
        vm.expectRevert(SignedPayout7702.ValueNotAllowed.selector);
        account.execute{value: 1}(p, signature);
    }
    function testDifferentImplementationRejectsOldSignature() public {
        SignedPayout7702.Payout memory p = _payout(0);
        bytes memory oldSignature = _sign(p);
        bytes32 oldDomain = account.domainSeparator();

        // Different deployment => different immutable implementation identity.
        SignedPayout7702 replacement = new SignedPayout7702();
        vm.etch(owner, address(replacement).code);
        assertTrue(account.domainSeparator() != oldDomain);

        vm.expectRevert(SignedPayout7702.InvalidSignature.selector);
        account.execute(p, oldSignature);
        assertEq(account.nonce(), 0);
        assertEq(recipient.balance, 0);
    }

    function testSameImplementationRetainsSignatureDomain() public {
        SignedPayout7702.Payout memory p = _payout(0);
        bytes memory signature = _sign(p);
        bytes32 originalDomain = account.domainSeparator();

        SignedPayout7702 sameImplementation = new SignedPayout7702();
        // Restoring identical deployed runtime code should preserve the domain.
        // The replacement deployment is intentionally unused here.
        assertTrue(address(sameImplementation) != owner);
        assertEq(account.domainSeparator(), originalDomain);
        vm.prank(address(0xCAFE));
        account.execute(p, signature);
        assertEq(recipient.balance, 1 ether);
    }

    function testOwnerCanCancelPendingSignedPayouts() public {
        SignedPayout7702.Payout memory p = _payout(0);
        bytes memory signature = _sign(p);
        vm.prank(owner);
        account.invalidateNonce(3);
        assertEq(account.nonce(), 3);
        vm.expectRevert(SignedPayout7702.InvalidNonce.selector);
        account.execute(p, signature);
        assertEq(recipient.balance, 0);
    }

    function testRelayerCannotInvalidateNonce() public {
        vm.prank(address(0xCAFE));
        vm.expectRevert(SignedPayout7702.OnlyAccount.selector);
        account.invalidateNonce(9);
        assertEq(account.nonce(), 0);
    }

    function testNonceInvalidationMustIncrease() public {
        vm.prank(owner);
        vm.expectRevert(SignedPayout7702.NonceNotIncreasing.selector);
        account.invalidateNonce(0);
        vm.prank(owner);
        account.invalidateNonce(2);
        vm.prank(owner);
        vm.expectRevert(SignedPayout7702.NonceNotIncreasing.selector);
        account.invalidateNonce(2);
    }
}
