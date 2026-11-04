// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";

/// @notice Single-chain ETH payment pilot. Each batch verifies signatures on chain.
contract NativePaymentPilot is EIP712 {
    bytes32 public constant TRANSFER_TYPEHASH = keccak256(
        "HubTransfer(address from,address to,bytes32 assetId,uint256 amount,uint256 fee,bytes32 feeAssetId,uint256 nonce,uint64 deadline,bytes32 serviceId,bytes32 manifestHash)"
    );

    struct HubTransfer {
        address from;
        address to;
        bytes32 assetId;
        uint256 amount;
        uint256 fee;
        bytes32 feeAssetId;
        uint256 nonce;
        uint64 deadline;
        bytes32 serviceId;
        bytes32 manifestHash;
    }

    bytes32 public immutable nativeAssetId;
    mapping(address => uint256) public balanceOf;
    mapping(address => uint256) public nonceOf;

    error InvalidPayment();
    error InvalidSignature();
    error InsufficientBalance();
    error NativeSendFailed();

    event Deposited(address indexed owner, uint256 amount);
    event Paid(bytes32 indexed digest, address indexed from, address indexed to, uint256 amount);
    event Withdrawn(address indexed owner, uint256 amount);

    constructor() EIP712("ZeroGasHub", "1") {
        nativeAssetId = keccak256(abi.encode(block.chainid, address(0)));
    }

    function deposit() external payable {
        if (msg.value == 0) revert InvalidPayment();
        balanceOf[msg.sender] += msg.value;
        emit Deposited(msg.sender, msg.value);
    }

    function hashTransfer(HubTransfer calldata payment) public view returns (bytes32) {
        return _hashTypedDataV4(keccak256(abi.encode(TRANSFER_TYPEHASH, payment)));
    }

    function settle(HubTransfer[] calldata payments, bytes[] calldata signatures) external {
        if (payments.length != signatures.length) revert InvalidPayment();
        for (uint256 i; i < payments.length; ++i) {
            HubTransfer calldata payment = payments[i];
            if (
                payment.to == address(0) || payment.amount == 0 || payment.assetId != nativeAssetId
                    || payment.fee != 0 || payment.feeAssetId != nativeAssetId || payment.deadline < block.timestamp
                    || payment.nonce != nonceOf[payment.from]
            ) revert InvalidPayment();

            bytes32 digest = hashTransfer(payment);
            if (ECDSA.recover(digest, signatures[i]) != payment.from) revert InvalidSignature();
            if (balanceOf[payment.from] < payment.amount) revert InsufficientBalance();

            nonceOf[payment.from] = payment.nonce + 1;
            balanceOf[payment.from] -= payment.amount;
            balanceOf[payment.to] += payment.amount;
            emit Paid(digest, payment.from, payment.to, payment.amount);
        }
    }

    function withdraw(uint256 amount) external {
        if (amount == 0 || balanceOf[msg.sender] < amount) revert InsufficientBalance();
        balanceOf[msg.sender] -= amount;
        (bool success,) = msg.sender.call{value: amount}("");
        if (!success) revert NativeSendFailed();
        emit Withdrawn(msg.sender, amount);
    }
}
