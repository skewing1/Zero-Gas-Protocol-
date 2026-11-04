// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {Test} from "forge-std/Test.sol";
import {RepeatedPaymentCodec} from "../../src/experimental/RepeatedPaymentCodec.sol";
contract RepeatedCodecHarness {
    function sum(uint256 count, bytes calldata data) external pure returns (uint256[] memory,uint256) {
        return RepeatedPaymentCodec.sum(count,data);
    }
}
contract RepeatedPaymentCodecTest is Test {
    RepeatedCodecHarness codec = new RepeatedCodecHarness();
    function testFuzzRepeatedTotals(uint64 a,uint64 b,uint32 repeats,uint8 first,uint8 second) public view {
        if(a==0) a=1; if(b==0) b=1; if(repeats==0) repeats=1;
        bytes memory data=abi.encodePacked(repeats,uint16(2),first,a,second,b);
        (uint256[] memory actual,uint256 count)=codec.sum(256,data);
        uint256[] memory expected=new uint256[](256);
        expected[first] += uint256(a)*repeats; expected[second] += uint256(b)*repeats;
        assertEq(actual,expected); assertEq(count,uint256(repeats)*2);
    }
    function testRejectsHeadersAndTrailingData() public {
        bytes[5] memory bad=[bytes(hex"00"), abi.encodePacked(uint32(0),uint16(1),uint8(0),uint64(1)),
            abi.encodePacked(uint32(1),uint16(0)),abi.encodePacked(uint32(1),uint16(2),uint8(0),uint64(1)),
            abi.encodePacked(uint32(1),uint16(1),uint8(0),uint64(1),uint8(0))];
        for(uint256 i;i<bad.length;++i) {
            vm.expectRevert(RepeatedPaymentCodec.InvalidEncoding.selector); codec.sum(1,bad[i]);
        }
    }
}
