// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {PaymentIntents} from "./Intent.sol";

contract ProtocolAccount {
    using SafeERC20 for IERC20;

    /// @custom:storage-location erc7201:sinister-rabbit.ProtocolAccount
    struct AccountStorage {
        mapping(uint192 => uint64) next;
        bool executing;
    }

    error Unauthorized();
    error Expired();
    error InvalidNonce();
    error FeeOverCap();
    error PaymentFailed();
    error ReentrantExecution();

    event IntentExecuted(
        bytes32 indexed intentHash, address indexed payee, address asset, uint256 amount, uint256 fee,
        address indexed relayer, bytes32 serviceId, bytes32 manifestHash
    );

    receive() external payable {}

    function executeIntent(
        PaymentIntents.Intent calldata intent, bytes calldata signature, uint256 fee, address relayer
    ) external {
        AccountStorage storage state = _storage();
        if (state.executing) revert ReentrantExecution();
        if (block.timestamp > intent.deadline) revert Expired();
        uint64 next = state.next[intent.nonceKey];
        if (next == type(uint64).max || next != intent.nonceSeq) revert InvalidNonce();
        if (fee > intent.feeCap) revert FeeOverCap();

        bytes32 digest = hashIntent(intent);
        if (!_signedByAccount(digest, signature)) revert Unauthorized();

        state.executing = true;
        state.next[intent.nonceKey] = next + 1;
        _transfer(intent.asset, intent.payee, intent.amount);
        _transfer(intent.asset, relayer, fee);
        state.executing = false;

        emit IntentExecuted(
            digest, intent.payee, intent.asset, intent.amount, fee, relayer, intent.serviceId, intent.manifestHash
        );
    }

    function cancelNonceKey(uint192 key) external {
        if (msg.sender != address(this)) revert Unauthorized();
        _storage().next[key] = type(uint64).max;
    }

    function nextNonce(uint192 key) external view returns (uint64) {
        return _storage().next[key];
    }

    function hashIntent(PaymentIntents.Intent calldata intent) public view returns (bytes32) {
        return PaymentIntents.digest(intent, address(this));
    }

    function isValidSignature(bytes32 digest, bytes calldata signature) external view returns (bytes4) {
        return _signedByAccount(digest, signature) ? bytes4(0x1626ba7e) : bytes4(0xffffffff);
    }

    function _signedByAccount(bytes32 digest, bytes calldata signature) private view returns (bool) {
        (address signer, ECDSA.RecoverError error,) = ECDSA.tryRecover(digest, signature);
        return error == ECDSA.RecoverError.NoError && signer == address(this);
    }

    function _transfer(address asset, address recipient, uint256 amount) private {
        if (amount == 0) return;
        if (asset == address(0)) {
            (bool paid,) = payable(recipient).call{value: amount}("");
            if (!paid) revert PaymentFailed();
        } else {
            IERC20(asset).safeTransfer(recipient, amount);
        }
    }

    function _storage() private pure returns (AccountStorage storage state) {
        bytes32 slot = keccak256(abi.encode(uint256(keccak256("sinister-rabbit.ProtocolAccount")) - 1))
            & ~bytes32(uint256(0xff));
        assembly ("memory-safe") {
            state.slot := slot
        }
    }
}
