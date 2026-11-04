// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Test} from "forge-std/Test.sol";
import {PaymentIntents} from "../../src/system/Intent.sol";
import {ProtocolAccount} from "../../src/system/ProtocolAccount.sol";
import {Settler} from "../../src/system/Settler.sol";

contract SettlementHandler is Test {
    uint256 private constant KEY = 0xa11ce;
    address private constant PAYEE = address(0x10001);
    ProtocolAccount public immutable payer;
    Settler public immutable settler;
    mapping(uint192 => uint64) public executions;
    uint256 public paid;
    uint256 public earned;

    constructor() {
        ProtocolAccount implementation = new ProtocolAccount();
        settler = new Settler(implementation);
        payer = ProtocolAccount(payable(vm.addr(KEY)));
        vm.attachDelegation(vm.signDelegation(address(implementation), KEY));
        vm.deal(address(payer), 1 ether);
    }

    function submit(uint192 laneSeed, uint16 amountSeed, uint8 feeSeed, bool replay) external {
        uint192 lane = laneSeed % 4;
        uint64 sequence = executions[lane];
        if (replay && sequence > 0) --sequence;
        uint256 amount = uint256(amountSeed) + 1;
        uint256 fee = feeSeed;
        PaymentIntents.Intent[] memory intents = new PaymentIntents.Intent[](1);
        intents[0] = PaymentIntents.Intent(PAYEE, address(0), amount, fee, 0, 0, lane, sequence, type(uint64).max);
        bytes[] memory signatures = new bytes[](1);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(KEY, payer.hashIntent(intents[0]));
        signatures[0] = abi.encodePacked(r, s, v);
        address[] memory accounts = new address[](1);
        accounts[0] = address(payer);
        uint256[] memory fees = new uint256[](1);
        fees[0] = fee;
        settler.settleBatch(accounts, intents, signatures, fees);
        if (sequence == executions[lane]) {
            ++executions[lane];
            paid += amount;
            earned += fee;
        }
    }

    receive() external payable {}
}

contract SettlementInvariantTest is Test {
    SettlementHandler private handler;

    function setUp() public {
        handler = new SettlementHandler();
        bytes4[] memory selectors = new bytes4[](1);
        selectors[0] = SettlementHandler.submit.selector;
        targetSelector(FuzzSelector(address(handler), selectors));
        targetContract(address(handler));
    }

    function invariant_PayoutsMatchSuccessfulNoncesAndSettlerHoldsNoFunds() public view {
        for (uint192 lane; lane < 4; ++lane) {
            assertEq(handler.payer().nextNonce(lane), handler.executions(lane));
        }
        assertEq(address(0x10001).balance, handler.paid());
        assertEq(address(handler).balance, handler.earned());
        assertEq(address(handler.payer()).balance + handler.paid() + handler.earned(), 1 ether);
        assertEq(address(handler.settler()).balance, 0);
    }
}
