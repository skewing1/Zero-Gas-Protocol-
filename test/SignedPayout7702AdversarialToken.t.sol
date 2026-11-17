// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {SignedPayout7702} from "../src/SignedPayout7702.sol";

/// @dev Adversarial ERC20 doubles; no Prague authorization tuple is exercised.
contract AdversarialToken7702 {
    mapping(address => uint256) public balanceOf;
    enum Mode { Normal, ReturnFalse, RevertCall, NoReturn, Reenter }
    Mode public mode;
    address public callbackTarget;
    bytes public callbackData;
    bool public callbackSucceeded;

    function mint(address to, uint256 amount) external { balanceOf[to] += amount; }
    function configure(Mode m, address target, bytes calldata data) external {
        mode = m;
        callbackTarget = target;
        callbackData = data;
    }
    function transfer(address to, uint256 amount) external returns (bool) {
        if (mode == Mode.RevertCall) revert("token revert");
        if (mode == Mode.ReturnFalse) return false;
        if (mode == Mode.Reenter) {
            (callbackSucceeded,) = callbackTarget.call(callbackData);
            if (callbackSucceeded) revert("reentry unexpectedly succeeded");
        }
        require(balanceOf[msg.sender] >= amount, "insufficient token");
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        if (mode == Mode.NoReturn) {
            assembly { return(0, 0) }
        }
        return true;
    }
}

contract SignedPayout7702AdversarialTokenTest is Test {
    uint256 private constant KEY = 0xA11CE;
    address private owner;
    SignedPayout7702 private account;
    AdversarialToken7702 private token;
    address payable private recipient = payable(address(0xB0B));

    function setUp() public {
        owner = vm.addr(KEY);
        SignedPayout7702 implementation = new SignedPayout7702();
        vm.etch(owner, address(implementation).code);
        account = SignedPayout7702(payable(owner));
        token = new AdversarialToken7702();
        token.mint(owner, 100);
    }

    function _items() private view returns (SignedPayout7702.PayoutItem[] memory items) {
        items = new SignedPayout7702.PayoutItem[](2);
        items[0] = SignedPayout7702.PayoutItem(address(token), recipient, 10);
        items[1] = SignedPayout7702.PayoutItem(address(token), recipient, 20);
    }

    function _signature(SignedPayout7702.PayoutItem[] memory items, uint256 deadline)
        private returns (bytes memory)
    {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(KEY, account.batchDigest(items, 0, deadline));
        return abi.encodePacked(r, s, v);
    }

    function testFalseReturningTokenRevertsWithoutConsumingNonce() public {
        SignedPayout7702.PayoutItem[] memory items = _items();
        uint256 deadline = block.timestamp + 100;
        bytes memory sig = _signature(items, deadline);
        token.configure(AdversarialToken7702.Mode.ReturnFalse, address(0), "");
        vm.expectRevert(SignedPayout7702.TransferFailed.selector);
        account.executeMany(items, 0, deadline, sig);
        assertEq(account.nonce(), 0);
        assertEq(token.balanceOf(recipient), 0);
        assertEq(token.balanceOf(owner), 100);
    }

    function testRevertingTokenRevertsWholeBatch() public {
        SignedPayout7702.PayoutItem[] memory items = _items();
        uint256 deadline = block.timestamp + 100;
        bytes memory sig = _signature(items, deadline);
        token.configure(AdversarialToken7702.Mode.RevertCall, address(0), "");
        vm.expectRevert(SignedPayout7702.TransferFailed.selector);
        account.executeMany(items, 0, deadline, sig);
        assertEq(account.nonce(), 0);
        assertEq(token.balanceOf(recipient), 0);
    }

    function testNoReturnTokenIsAccepted() public {
        SignedPayout7702.PayoutItem[] memory items = _items();
        uint256 deadline = block.timestamp + 100;
        bytes memory sig = _signature(items, deadline);
        token.configure(AdversarialToken7702.Mode.NoReturn, address(0), "");
        account.executeMany(items, 0, deadline, sig);
        assertEq(account.nonce(), 1);
        assertEq(token.balanceOf(recipient), 30);
        assertEq(token.balanceOf(owner), 70);
    }

    function testTokenCannotReenterSignedBatch() public {
        SignedPayout7702.PayoutItem[] memory items = _items();
        uint256 deadline = block.timestamp + 100;
        bytes memory sig = _signature(items, deadline);
        bytes memory nested = abi.encodeCall(SignedPayout7702.executeMany, (items, 0, deadline, sig));
        token.configure(AdversarialToken7702.Mode.Reenter, address(account), nested);
        account.executeMany(items, 0, deadline, sig);
        assertFalse(token.callbackSucceeded());
        assertEq(account.nonce(), 1);
        assertEq(token.balanceOf(recipient), 30);
    }
}
