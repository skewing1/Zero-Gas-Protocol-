// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import {Checkpoints} from "./Checkpoint.sol";
import {IVerifier} from "./IVerifier.sol";

contract Anchor {
    struct Stream {
        uint256 nextIndex;
        uint256 nextEpoch;
        uint256 sourceBlock;
        bytes32 accumulator;
    }

    struct Record {
        bytes32 checkpointHash;
        bytes32 receiptsRoot;
    }

    mapping(bytes32 => Stream) public streams;
    mapping(bytes32 => mapping(uint256 => Record)) public checkpoints;

    error InvalidCheckpoint();
    error VerificationFailed();

    event Anchored(
        uint256 indexed sourceChainId, address indexed settler, address indexed verifier,
        uint256 epoch, uint256 toReceiptIndex, bytes32 receiptsRoot
    );

    function streamId(uint256 sourceChainId, address settler, address verifier) public pure returns (bytes32) {
        return keccak256(abi.encode(sourceChainId, settler, verifier));
    }

    function submit(Checkpoints.Checkpoint calldata cp, address verifier, bytes calldata evidence) external {
        bytes32 id = streamId(cp.sourceChainId, cp.settler, verifier);
        Stream storage stream = streams[id];
        if (cp.fromReceiptIndex != stream.nextIndex || cp.prevAccumulator != stream.accumulator
            || cp.toReceiptIndex < cp.fromReceiptIndex || cp.toReceiptIndex == type(uint256).max
            || cp.receiptsRoot == bytes32(0) || cp.sourceBlockHash == bytes32(0)
            || cp.sourceBlockNumber < stream.sourceBlock) revert InvalidCheckpoint();
        if (!IVerifier(verifier).verify(cp, evidence)) revert VerificationFailed();

        uint256 epoch = stream.nextEpoch++;
        stream.nextIndex = cp.toReceiptIndex + 1;
        stream.sourceBlock = cp.sourceBlockNumber;
        stream.accumulator = cp.endAccumulator;
        checkpoints[id][epoch] = Record(Checkpoints.hash(cp), cp.receiptsRoot);
        emit Anchored(cp.sourceChainId, cp.settler, verifier, epoch, cp.toReceiptIndex, cp.receiptsRoot);
    }

    function verifyReceipt(
        uint256 sourceChainId, address settler, address verifier, uint256 epoch, bytes32 leaf, bytes32[] calldata proof
    ) external view returns (bool) {
        bytes32 root = checkpoints[streamId(sourceChainId, settler, verifier)][epoch].receiptsRoot;
        return root != bytes32(0) && MerkleProof.verifyCalldata(proof, root, leaf);
    }
}
