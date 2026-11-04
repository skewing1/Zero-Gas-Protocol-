// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script} from "forge-std/Script.sol";
import {BatchPayout} from "../src/BatchPayout.sol";
import {ClaimSettlement} from "../src/ClaimSettlement.sol";
import {BenchToken} from "../test/mocks/BenchToken.sol";

contract Bench is Script {
    function run(bool token, bool batch, bool claim) external {
        vm.startBroadcast();
        if (token) new BenchToken();
        if (batch) new BatchPayout();
        if (claim) new ClaimSettlement();
        vm.stopBroadcast();
    }
}
