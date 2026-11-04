// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

library Checkpoints {
    struct Checkpoint {
        uint256 sourceChainId;
        address settler;
        uint256 fromReceiptIndex;
        uint256 toReceiptIndex;
        bytes32 prevAccumulator;
        bytes32 endAccumulator;
        bytes32 receiptsRoot;
        uint256 sourceBlockNumber;
        bytes32 sourceBlockHash;
    }

    struct Receipt {
        uint256 sourceChainId;
        address settler;
        uint256 receiptIndex;
        address account;
        bytes32 intentHash;
        address payee;
        address asset;
        uint256 amount;
        uint256 fee;
        uint256 blockNumber;
    }

    bytes32 internal constant TYPEHASH = keccak256(
        "Checkpoint(uint256 sourceChainId,address settler,uint256 fromReceiptIndex,uint256 toReceiptIndex,bytes32 prevAccumulator,bytes32 endAccumulator,bytes32 receiptsRoot,uint256 sourceBlockNumber,bytes32 sourceBlockHash)"
    );

    function hash(Checkpoint calldata cp) internal pure returns (bytes32) {
        return keccak256(abi.encode(TYPEHASH, cp));
    }

    function leaf(Receipt memory receipt) internal pure returns (bytes32) {
        return keccak256(bytes.concat(keccak256(abi.encode(receipt))));
    }
}
