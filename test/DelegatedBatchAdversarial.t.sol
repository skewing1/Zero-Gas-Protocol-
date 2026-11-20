// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {DelegatedBatchAccount} from "../src/DelegatedBatchAccount.sol";

interface VmAdversarial {
    function addr(uint256) external returns (address);
    function sign(uint256, bytes32) external returns (uint8, bytes32, bytes32);
    function etch(address, bytes calldata) external;
    function deal(address, uint256) external;
    function prank(address) external;
    function expectRevert(bytes4) external;
}

contract RejectEther {
    receive() external payable { revert("reject"); }
}

contract ReenterBatch {
    DelegatedBatchAccount public account;
    bytes public attemptedCall;
    bool public callbackAttempted;
    bool public reentrySucceeded;

    function configure(DelegatedBatchAccount target, bytes calldata callData) external {
        account = target;
        attemptedCall = callData;
    }

    receive() external payable {
        callbackAttempted = true;
        (reentrySucceeded,) = address(account).call(attemptedCall);
    }
}

contract DelegatedBatchAdversarialTest {
    VmAdversarial private constant vm = VmAdversarial(address(uint160(uint256(keccak256("hevm cheat code")))));
    uint256 private constant KEY = 0xA11CE;
    DelegatedBatchAccount private account;
    address private owner;
    address private constant RELAYER = address(0xBEEF);
    address private constant BENEFICIARY = address(0xCAFE);

    function setUp() public {
        DelegatedBatchAccount implementation = new DelegatedBatchAccount();
        owner = vm.addr(KEY);
        vm.etch(owner, address(implementation).code);
        account = DelegatedBatchAccount(owner);
        vm.deal(owner, 10 ether);
        vm.deal(RELAYER, 0);
        vm.deal(BENEFICIARY, 0);
    }

    function signedBatch(address[] memory recipients, uint256[] memory amounts, uint256 fee)
        private returns (uint256 deadline, bytes memory sig)
    {
        deadline = block.timestamp + 1000;
        bytes32 digest = account.intentDigest(recipients, amounts, 0, deadline, fee);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(KEY, digest);
        sig = abi.encodePacked(r, s, v);
    }

    function testRevertingRecipientRollsBackAllTransfersAndNonce() public {
        RejectEther rejecting = new RejectEther();
        address[] memory recipients = new address[](2);
        recipients[0] = BENEFICIARY;
        recipients[1] = address(rejecting);
        uint256[] memory amounts = new uint256[](2);
        amounts[0] = 1 ether;
        amounts[1] = 2 ether;
        (uint256 deadline, bytes memory sig) = signedBatch(recipients, amounts, 0.1 ether);

        vm.prank(RELAYER);
        vm.expectRevert(DelegatedBatchAccount.PaymentFailed.selector);
        account.executeBatch(recipients, amounts, 0, deadline, 0.1 ether, sig);

        require(BENEFICIARY.balance == 0, "earlier transfer not rolled back");
        require(address(rejecting).balance == 0, "rejecting recipient paid");
        require(owner.balance == 10 ether, "owner balance changed");
        require(RELAYER.balance == 0, "relayer compensated on failure");
        require(account.nonce() == 0, "nonce consumed on failure");
    }

    function testRecipientCallbackCannotReenterSignedBatch() public {
        ReenterBatch attacker = new ReenterBatch();
        address[] memory recipients = new address[](1);
        recipients[0] = address(attacker);
        uint256[] memory amounts = new uint256[](1);
        amounts[0] = 1 ether;
        (uint256 deadline, bytes memory sig) = signedBatch(recipients, amounts, 0.1 ether);
        bytes memory calldataToReplay = abi.encodeCall(
            DelegatedBatchAccount.executeBatch,
            (recipients, amounts, 0, deadline, 0.1 ether, sig)
        );
        attacker.configure(account, calldataToReplay);

        vm.prank(RELAYER);
        account.executeBatch(recipients, amounts, 0, deadline, 0.1 ether, sig);

        require(attacker.callbackAttempted(), "callback not exercised");
        require(!attacker.reentrySucceeded(), "reentry succeeded");
        require(address(attacker).balance == 1 ether, "unexpected payout");
        require(RELAYER.balance == 0.1 ether, "relayer fee mismatch");
        require(owner.balance == 8.9 ether, "unexpected owner debit");
        require(account.nonce() == 1, "nonce mismatch");
    }

    function testRelayerCannotIncreaseSignedFee() public {
        address[] memory recipients = new address[](1);
        recipients[0] = BENEFICIARY;
        uint256[] memory amounts = new uint256[](1);
        amounts[0] = 1 ether;
        (uint256 deadline, bytes memory sig) = signedBatch(recipients, amounts, 0.1 ether);

        vm.prank(RELAYER);
        vm.expectRevert(DelegatedBatchAccount.InvalidSignature.selector);
        account.executeBatch(recipients, amounts, 0, deadline, 0.2 ether, sig);

        require(account.nonce() == 0, "nonce consumed");
        require(BENEFICIARY.balance == 0, "recipient paid");
        require(RELAYER.balance == 0, "relayer paid");
    }
}
