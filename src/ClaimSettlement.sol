// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @notice Prefunded native-asset distribution. Each immutable batch commits to
/// indexed payouts. Anyone may submit a proof, but funds go to the leaf recipient.
contract ClaimSettlement {
    struct Batch {
        bytes32 root;
        uint256 remaining;
    }

    uint256 public batchCount;
    mapping(uint256 => Batch) public batches;
    mapping(uint256 => mapping(uint256 => uint256)) private claimed;

    error InvalidBatch();
    error InvalidClaim();
    error AlreadyClaimed();
    error PaymentFailed();

    event BatchPublished(uint256 indexed batchId, address indexed publisher, bytes32 root, uint256 amount);
    event Claimed(uint256 indexed batchId, uint256 indexed index, address indexed recipient, uint256 amount);

    function publish(bytes32 root) external payable returns (uint256 batchId) {
        if (root == bytes32(0) || msg.value == 0) revert InvalidBatch();
        batchId = ++batchCount;
        batches[batchId] = Batch(root, msg.value);
        emit BatchPublished(batchId, msg.sender, root, msg.value);
    }

    function claim(
        uint256 batchId, uint256 index, address payable recipient, uint256 amount, bytes32[] calldata proof
    ) external {
        uint256 word = index >> 8;
        uint256 mask = uint256(1) << (index & 255);
        uint256 flags = claimed[batchId][word];
        if (flags & mask != 0) revert AlreadyClaimed();

        Batch storage batch = batches[batchId];
        bytes32 node = keccak256(bytes.concat(keccak256(abi.encode(index, recipient, amount))));
        for (uint256 i; i < proof.length; ++i) {
            bytes32 sibling = proof[i];
            node = node < sibling
                ? keccak256(abi.encodePacked(node, sibling))
                : keccak256(abi.encodePacked(sibling, node));
        }

        if (batch.root == bytes32(0) || node != batch.root || recipient == address(0)
            || amount == 0 || amount > batch.remaining) revert InvalidClaim();

        claimed[batchId][word] = flags | mask;
        batch.remaining -= amount;
        (bool paid,) = recipient.call{value: amount}("");
        if (!paid) revert PaymentFailed();
        emit Claimed(batchId, index, recipient, amount);
    }
}
