// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Checkpoints} from "./Checkpoint.sol";
import {IVerifier} from "./IVerifier.sol";

/// @notice Simulation only. Anyone can announce arbitrary data. This contract
/// does not implement or model the security of OP Stack fault proofs.
contract MockCanonicalVerifier is IVerifier {
    uint256 public immutable challengeDelay;
    mapping(bytes32 => uint256) public eligibleAt;

    constructor(uint256 delay) { challengeDelay = delay == 0 ? 7 days : delay; }

    function announce(Checkpoints.Checkpoint calldata cp) external {
        bytes32 digest = Checkpoints.hash(cp);
        if (eligibleAt[digest] == 0) eligibleAt[digest] = block.timestamp + challengeDelay;
    }

    function verify(Checkpoints.Checkpoint calldata cp, bytes calldata) external view returns (bool) {
        uint256 ready = eligibleAt[Checkpoints.hash(cp)];
        return ready != 0 && block.timestamp >= ready;
    }

    function trustLevel() external pure returns (string memory) { return "simulated: no canonical verification"; }
}
