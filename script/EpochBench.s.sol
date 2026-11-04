// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Script} from "forge-std/Script.sol";
import {EpochAccount} from "../src/experimental/EpochAccount.sol";
import {EpochSettler} from "../src/experimental/EpochSettler.sol";

contract EpochBench is Script {
    function run() external {
        vm.startBroadcast();
        EpochAccount account = new EpochAccount();
        new EpochSettler(account);
        vm.stopBroadcast();
    }
}
