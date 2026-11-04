// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {Test} from "forge-std/Test.sol";
import {EpochAccount} from "../../src/experimental/EpochAccount.sol";
contract EpochHandler is Test {
    EpochAccount public account;
    uint256 constant KEY = 0xcafe;
    address constant PAYEE = address(0x100001);
    address constant RELAYER = address(0x100002);
    uint256 public paid;
    uint256 public fees;
    constructor() {
        EpochAccount implementation = new EpochAccount();
        account = EpochAccount(payable(vm.addr(KEY)));
        vm.attachDelegation(vm.signDelegation(address(implementation), KEY));
        vm.deal(address(account), 100 ether);
    }
    function settle(uint64 amount, uint8 key, uint8 fee) external {
        amount = uint64(bound(amount, 1, 1e12)); key %= 4; fee %= 11;
        uint64 seq = account.nextNonce(key);
        if (seq == type(uint64).max) return;
        address[] memory to = new address[](1); to[0] = PAYEE;
        bytes memory payments = abi.encodePacked(uint8(0), amount, uint8(0), amount);
        EpochAccount.Epoch memory e = EpochAccount.Epoch(address(0), keccak256(abi.encode(to)), keccak256(payments),10,key,seq,type(uint64).max);
        (uint8 v,bytes32 r,bytes32 s) = vm.sign(KEY,account.hashEpoch(e));
        bytes memory signature = abi.encodePacked(r,s,v);
        account.executeEpoch(e,to,payments,signature,fee,RELAYER);
        paid += uint256(amount)*2; fees += fee;
        (bool replay,) = address(account).call(abi.encodeCall(EpochAccount.executeEpoch,(e,to,payments,signature,fee,RELAYER)));
        assertFalse(replay);
    }
    function cancel(uint8 key) external {
        vm.prank(address(account)); account.cancelNonceKey(key%4);
    }
    function conserved() external view returns (bool) {
        return address(account).balance + paid + fees == 100 ether && PAYEE.balance == paid && RELAYER.balance == fees;
    }
}
contract EpochInvariantTest is Test {
    EpochHandler handler;
    function setUp() public { handler = new EpochHandler(); targetContract(address(handler)); }
    function invariantConservationAndReplay() public view { assertTrue(handler.conserved()); }
}
