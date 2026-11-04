// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {RepeatedPaymentCodec} from "./RepeatedPaymentCodec.sol";
import {ProtocolAccount} from "../system/ProtocolAccount.sol";

/// @notice Experimental protocol account for explicit payer-authorized settlement windows.
/// @dev Version 2 signs losslessly encoded periodic payment data. The full ordered
/// payment list is reconstructible from calldata. Totals are computed on-chain.
contract EpochAccount is ProtocolAccount {
    struct Epoch {
        address asset;
        bytes32 recipientsHash;
        bytes32 paymentsHash;
        uint256 feeCap;
        uint192 nonceKey;
        uint64 nonceSeq;
        uint64 deadline;
    }

    bytes32 private constant TYPEHASH = keccak256(
        "Epoch(address asset,bytes32 recipientsHash,bytes32 paymentsHash,uint256 feeCap,uint192 nonceKey,uint64 nonceSeq,uint64 deadline)"
    );
    bytes32 private constant DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");

    error InvalidEncoding();
    error InvalidRecipients();
    error CommitmentMismatch();

    event EpochExecuted(
        bytes32 indexed epochHash, address indexed asset, address indexed relayer,
        uint256 paymentCount, uint256 recipientCount, uint256 amount, uint256 fee
    );

    function hashEpoch(Epoch calldata epoch) public view returns (bytes32) {
        bytes32 domain = keccak256(abi.encode(
            DOMAIN_TYPEHASH, keccak256("ProtocolEpochAccount"), keccak256("2"), block.chainid, address(this)
        ));
        return keccak256(abi.encodePacked(hex"1901", domain, keccak256(abi.encode(TYPEHASH, epoch))));
    }

    function executeEpoch(
        Epoch calldata epoch, address[] calldata recipients, bytes calldata payments,
        bytes calldata signature, uint256 fee, address relayer
    ) external {
        _enter();
        if (block.timestamp > epoch.deadline) revert Expired();
        if (_storage().next[epoch.nonceKey] == type(uint64).max ||
            _storage().next[epoch.nonceKey] != epoch.nonceSeq) revert InvalidNonce();
        if (fee > epoch.feeCap) revert FeeOverCap();
        if (epoch.recipientsHash != keccak256(abi.encode(recipients)) || epoch.paymentsHash != keccak256(payments)) {
            revert CommitmentMismatch();
        }
        bytes32 digest = hashEpoch(epoch);
        if (!_signedByAccount(digest, signature)) revert Unauthorized();

        (uint256 total, uint256 paymentCount) = _pay(epoch, recipients, payments);
        _transfer(epoch.asset, relayer, fee);
        _exit();
        emit EpochExecuted(digest, epoch.asset, relayer, paymentCount, recipients.length, total, fee);
    }

    function _pay(Epoch calldata epoch, address[] calldata recipients, bytes calldata payments)
        private returns (uint256 total, uint256 paymentCount)
    {
        uint256[] memory amounts;
        (amounts, paymentCount) = _sum(recipients, payments);
        _storage().next[epoch.nonceKey] = epoch.nonceSeq + 1;
        for (uint256 index; index < recipients.length; ++index) {
            total += amounts[index];
            _transfer(epoch.asset, recipients[index], amounts[index]);
        }
    }

    function _sum(address[] calldata recipients, bytes calldata payments) private view returns (uint256[] memory totals, uint256 paymentCount) {
        uint256 length = recipients.length;
        if (length == 0 || length > 256) revert InvalidRecipients();
        for (uint256 index; index < length; ++index) {
            if (recipients[index] == address(0) || recipients[index] == address(this)) revert InvalidRecipients();
        }
        return RepeatedPaymentCodec.sum(length, payments);
    }
}
