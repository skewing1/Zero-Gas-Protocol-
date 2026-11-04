// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {Test} from "forge-std/Test.sol";
import {PaymentCodec} from "../../src/experimental/PaymentCodec.sol";
contract CodecHarness {
    function sum(uint256 count, bytes calldata data) external pure returns (uint256[] memory) {
        return PaymentCodec.sum(count, data);
    }
}
contract PaymentCodecTest is Test {
    CodecHarness codec = new CodecHarness();
    function referenceSum(uint256 count, bytes memory data) private pure returns (uint256[] memory values) {
        values = new uint256[](count);
        for (uint256 cursor; cursor < data.length; cursor += 9) {
            uint256 amount;
            for (uint256 j = 1; j <= 8; ++j) amount = amount * 256 + uint8(data[cursor + j]);
            values[uint8(data[cursor])] += amount;
        }
    }
    function testFuzzReferenceEquivalence(bytes32 seed, uint16 rawCount, uint16 rawLength) public view {
        uint256 count = bound(rawCount,1,256);
        uint256 length = bound(rawLength,1,400);
        bytes memory data = new bytes(length * 9);
        for (uint256 i; i < length; ++i) {
            uint256 word = uint256(keccak256(abi.encode(seed,i)));
            data[i*9] = bytes1(uint8(word % count));
            uint64 amount = uint64(word >> 8);
            if (amount == 0) amount = 1;
            for (uint256 j; j < 8; ++j) data[i*9+1+j] = bytes1(uint8(amount >> ((7-j)*8)));
        }
        assertEq(codec.sum(count,data), referenceSum(count,data));
    }
    function testMaximumAmountAndLastRecipient() public view {
        bytes memory data = abi.encodePacked(uint8(255),type(uint64).max,uint8(255),type(uint64).max);
        uint256[] memory values = codec.sum(256,data);
        assertEq(values[255],uint256(type(uint64).max)*2);
        assertEq(values[0],0);
    }
    function testRejectsMalformedAndOutOfBounds() public {
        vm.expectRevert(PaymentCodec.InvalidRecipients.selector); codec.sum(0,hex"00");
        vm.expectRevert(PaymentCodec.InvalidRecipients.selector); codec.sum(257,hex"00");
        vm.expectRevert(PaymentCodec.InvalidEncoding.selector); codec.sum(1,hex"");
        for (uint256 size=1; size<9; ++size) {
            bytes memory bad = new bytes(size);
            vm.expectRevert(PaymentCodec.InvalidEncoding.selector); codec.sum(1,bad);
        }
        vm.expectRevert(PaymentCodec.InvalidEncoding.selector);
        codec.sum(1,abi.encodePacked(uint8(1),uint64(1)));
        vm.expectRevert(PaymentCodec.InvalidEncoding.selector);
        codec.sum(1,abi.encodePacked(uint8(0),uint64(0)));
    }
}
