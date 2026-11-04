// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script} from "forge-std/Script.sol";
import {BatchPayout} from "../src/BatchPayout.sol";
import {ClaimSettlement} from "../src/ClaimSettlement.sol";
import {BenchToken} from "../test/mocks/BenchToken.sol";

import {ProtocolAccount} from "../src/system/ProtocolAccount.sol";
import {Settler} from "../src/system/Settler.sol";

contract Bench is Script {
    function run(bool token, bool batch, bool claim, bool protocol) external {
        vm.startBroadcast();
        if (token) new BenchToken();
        if (batch) new BatchPayout();
        if (claim) new ClaimSettlement();
        if (protocol) {
            ProtocolAccount implementation = new ProtocolAccount();
            new Settler(implementation);
        }
        vm.stopBroadcast();
    }
}
