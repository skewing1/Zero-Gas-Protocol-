// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {PaymentIntents} from "./Intent.sol";
import {ProtocolAccount} from "./ProtocolAccount.sol";

contract Settler {
    bytes32 private immutable delegationCodeHash;
    bytes32 public receiptAccumulator;

    error InvalidLength();
    error InvalidDelegation();

    event Skipped(address indexed account, bytes32 indexed intentHash, bytes revertData);
    event BatchReceipt(bytes32 indexed accumulator);

    constructor(ProtocolAccount implementation) {
        delegationCodeHash = keccak256(abi.encodePacked(hex"ef0100", address(implementation)));
    }

    function settleBatch(
        address[] calldata accounts, PaymentIntents.Intent[] calldata intents, bytes[] calldata signatures,
        uint256[] calldata fees
    ) external {
        uint256 length = accounts.length;
        if (length != intents.length || length != signatures.length || length != fees.length) revert InvalidLength();

        for (uint256 index; index < length; ++index) {
            address account = accounts[index];
            bytes32 digest = PaymentIntents.digest(intents[index], account);
            if (account.codehash != delegationCodeHash) {
                emit Skipped(account, digest, abi.encodeWithSelector(InvalidDelegation.selector));
                continue;
            }
            try ProtocolAccount(payable(account)).executeIntent(intents[index], signatures[index], fees[index], msg.sender) {
                receiptAccumulator = keccak256(abi.encode(receiptAccumulator, account, digest, block.number));
            } catch (bytes memory reason) {
                emit Skipped(account, digest, reason);
            }
        }
        emit BatchReceipt(receiptAccumulator);
    }
}
