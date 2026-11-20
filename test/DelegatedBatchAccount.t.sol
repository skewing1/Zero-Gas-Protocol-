// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {DelegatedBatchAccount} from "../src/DelegatedBatchAccount.sol";

interface Vm {
    function addr(uint256) external returns (address);
    function sign(uint256, bytes32) external returns (uint8, bytes32, bytes32);
    function etch(address, bytes calldata) external;
    function deal(address, uint256) external;
    function prank(address) external;
    function expectRevert(bytes4) external;
    function chainId(uint256) external;
    function warp(uint256) external;
}

contract DelegatedBatchAccountTest {
    Vm private constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));
    uint256 private constant KEY = 0xA11CE;
    DelegatedBatchAccount private account;
    address private owner;
    address private constant RELAYER = address(0xBEEF);
    address private constant RECIPIENT_A = address(0xCAFE);
    address private constant RECIPIENT_B = address(0xD00D);

    function setUp() public {
        DelegatedBatchAccount implementation = new DelegatedBatchAccount();
        owner = vm.addr(KEY);
        // Emulates delegated EOA runtime only. This is NOT a mined EIP-7702 type-4 transaction.
        vm.etch(owner, address(implementation).code);
        account = DelegatedBatchAccount(owner);
        vm.deal(owner, 10 ether);
        vm.deal(RELAYER, 0);
    }

    function _batch() private pure returns (address[] memory to, uint256[] memory amounts) {
        to = new address[](2);
        amounts = new uint256[](2);
        to[0] = RECIPIENT_A;
        to[1] = RECIPIENT_B;
        amounts[0] = 1 ether;
        amounts[1] = 2 ether;
    }

    function _signature(
        address[] memory to, uint256[] memory amounts, uint256 n, uint256 deadline, uint256 fee
    ) private returns (bytes memory) {
        bytes32 digest = account.intentDigest(to, amounts, n, deadline, fee);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(KEY, digest);
        return abi.encodePacked(r, s, v);
    }

    function testSignedCancellationInvalidatesOutstandingBatch() public {
        (address[] memory to, uint256[] memory amounts) = _batch();
        uint256 deadline = block.timestamp + 1000;
        bytes memory paymentSignature = _signature(to, amounts, 0, deadline, 0);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(KEY, account.cancelDigest(0, deadline));
        bytes memory cancelSignature = abi.encodePacked(r, s, v);
        vm.prank(RELAYER);
        account.cancelIntent(0, deadline, cancelSignature);
        require(account.nonce() == 1, "cancel nonce");
        vm.expectRevert(DelegatedBatchAccount.InvalidInput.selector);
        account.executeBatch(to, amounts, 0, deadline, 0, paymentSignature);
        require(RECIPIENT_A.balance == 0 && RECIPIENT_B.balance == 0, "cancel transferred funds");
    }

    function testCancellationReplayAndTamperFail() public {
        uint256 deadline = block.timestamp + 1000;
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(KEY, account.cancelDigest(0, deadline));
        bytes memory sig = abi.encodePacked(r, s, v);
        vm.expectRevert(DelegatedBatchAccount.InvalidSignature.selector);
        account.cancelIntent(0, deadline + 1, sig);
        account.cancelIntent(0, deadline, sig);
        vm.expectRevert(DelegatedBatchAccount.InvalidInput.selector);
        account.cancelIntent(0, deadline, sig);
    }

    function testCancellationWrongChainAndExpiryFail() public {
        uint256 deadline = block.timestamp + 1;
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(KEY, account.cancelDigest(0, deadline));
        bytes memory sig = abi.encodePacked(r, s, v);
        uint256 chain = block.chainid;
        vm.chainId(chain + 1);
        vm.expectRevert(DelegatedBatchAccount.InvalidSignature.selector);
        account.cancelIntent(0, deadline, sig);
        vm.chainId(chain);
        vm.warp(deadline + 1);
        vm.expectRevert(DelegatedBatchAccount.Expired.selector);
        account.cancelIntent(0, deadline, sig);
        require(account.nonce() == 0, "nonce changed");
    }

    function testPermissionlessRelayerAndBalances() public {
        (address[] memory to, uint256[] memory amounts) = _batch();
        uint256 deadline = block.timestamp + 1000;
        bytes memory sig = _signature(to, amounts, 0, deadline, 0.1 ether);
        vm.prank(RELAYER);
        account.executeBatch(to, amounts, 0, deadline, 0.1 ether, sig);
        require(RECIPIENT_A.balance == 1 ether, "recipient A");
        require(RECIPIENT_B.balance == 2 ether, "recipient B");
        require(RELAYER.balance == 0.1 ether, "relayer fee");
        require(owner.balance == 6.9 ether, "owner debit");
        require(account.nonce() == 1, "nonce");
    }

    function testReplayFails() public {
        (address[] memory to, uint256[] memory amounts) = _batch();
        uint256 deadline = block.timestamp + 1000;
        bytes memory sig = _signature(to, amounts, 0, deadline, 0);
        account.executeBatch(to, amounts, 0, deadline, 0, sig);
        vm.expectRevert(DelegatedBatchAccount.InvalidInput.selector);
        account.executeBatch(to, amounts, 0, deadline, 0, sig);
    }

    function testTamperedAmountFails() public {
        (address[] memory to, uint256[] memory amounts) = _batch();
        uint256 deadline = block.timestamp + 1000;
        bytes memory sig = _signature(to, amounts, 0, deadline, 0);
        amounts[0] = 3 ether;
        vm.expectRevert(DelegatedBatchAccount.InvalidSignature.selector);
        account.executeBatch(to, amounts, 0, deadline, 0, sig);
    }

    function testWrongChainFails() public {
        (address[] memory to, uint256[] memory amounts) = _batch();
        uint256 deadline = block.timestamp + 1000;
        bytes memory sig = _signature(to, amounts, 0, deadline, 0);
        vm.chainId(block.chainid + 1);
        vm.expectRevert(DelegatedBatchAccount.InvalidSignature.selector);
        account.executeBatch(to, amounts, 0, deadline, 0, sig);
    }

    function testExpiredFails() public {
        (address[] memory to, uint256[] memory amounts) = _batch();
        uint256 deadline = block.timestamp + 1;
        bytes memory sig = _signature(to, amounts, 0, deadline, 0);
        vm.warp(deadline + 1);
        vm.expectRevert(DelegatedBatchAccount.Expired.selector);
        account.executeBatch(to, amounts, 0, deadline, 0, sig);
    }

    function testInsufficientBalanceFailsWithoutNonceChange() public {
        (address[] memory to, uint256[] memory amounts) = _batch();
        uint256 deadline = block.timestamp + 1000;
        bytes memory sig = _signature(to, amounts, 0, deadline, 9 ether);
        vm.expectRevert(DelegatedBatchAccount.InsufficientBalance.selector);
        account.executeBatch(to, amounts, 0, deadline, 9 ether, sig);
        require(account.nonce() == 0, "nonce changed");
    }
    function testSignatureBoundToImplementationAcrossRedelegation() public {
        (address[] memory to, uint256[] memory amounts) = _batch();
        uint256 deadline = block.timestamp + 1000;
        bytes memory sig = _signature(to, amounts, 0, deadline, 0);
        bytes32 originalDigest = account.intentDigest(to, amounts, 0, deadline, 0);
        // A new deployment has a different immutable implementation identity.
        DelegatedBatchAccount replacement = new DelegatedBatchAccount();
        vm.etch(owner, address(replacement).code);
        require(account.intentDigest(to, amounts, 0, deadline, 0) != originalDigest, "implementation not bound");
        vm.expectRevert(DelegatedBatchAccount.InvalidSignature.selector);
        account.executeBatch(to, amounts, 0, deadline, 0, sig);
        require(account.nonce() == 0, "nonce changed");
    }

}
