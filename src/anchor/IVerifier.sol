// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Checkpoints} from "./Checkpoint.sol";

interface IVerifier {
    function verify(Checkpoints.Checkpoint calldata cp, bytes calldata evidence) external view returns (bool);
    function trustLevel() external view returns (string memory);
}
