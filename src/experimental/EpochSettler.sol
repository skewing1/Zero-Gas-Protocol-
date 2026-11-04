// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {EpochAccount} from "./EpochAccount.sol";

/// @notice Permissionless batch submission for explicit signed payment epochs.
contract EpochSettler {
    struct Submission {
        address account;
        EpochAccount.Epoch epoch;
        address[] recipients;
        bytes payments;
        bytes signature;
        uint256 fee;
    }

    bytes32 private immutable delegationCodeHash;
    bytes32 public receiptAccumulator;

    event EpochRecorded(address indexed account, bytes32 indexed epochHash, bytes32 accumulator);
    event Skipped(address indexed account, bytes reason);
    error InvalidDelegation();

    constructor(EpochAccount implementation) {
        delegationCodeHash = keccak256(abi.encodePacked(hex"ef0100", address(implementation)));
    }

    function settle(Submission[] calldata submissions) external {
        for (uint256 index; index < submissions.length; ++index) {
            Submission calldata submission = submissions[index];
            address account = submission.account;
            if (account.codehash != delegationCodeHash) {
                emit Skipped(account, abi.encodeWithSelector(InvalidDelegation.selector));
                continue;
            }
            try EpochAccount(payable(account)).executeEpoch(
                submission.epoch, submission.recipients, submission.payments, submission.signature, submission.fee, msg.sender
            ) {
                bytes32 digest = EpochAccount(payable(account)).hashEpoch(submission.epoch);
                receiptAccumulator = keccak256(abi.encode(receiptAccumulator, account, digest, block.number));
                emit EpochRecorded(account, digest, receiptAccumulator);
            } catch (bytes memory reason) {
                emit Skipped(account, reason);
            }
        }
    }
}
