// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

library PaymentIntents {
    struct Intent {
        address payee;
        address asset;
        uint256 amount;
        uint256 feeCap;
        bytes32 serviceId;
        bytes32 manifestHash;
        uint192 nonceKey;
        uint64 nonceSeq;
        uint64 deadline;
    }

    bytes32 internal constant TYPEHASH = keccak256(
        "Intent(address payee,address asset,uint256 amount,uint256 feeCap,bytes32 serviceId,bytes32 manifestHash,uint192 nonceKey,uint64 nonceSeq,uint64 deadline)"
    );
    bytes32 private constant DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");

    function hash(Intent calldata intent) internal pure returns (bytes32) {
        return keccak256(abi.encode(
            TYPEHASH, intent.payee, intent.asset, intent.amount, intent.feeCap, intent.serviceId,
            intent.manifestHash, intent.nonceKey, intent.nonceSeq, intent.deadline
        ));
    }

    function digest(Intent calldata intent, address account) internal view returns (bytes32) {
        bytes32 domain = keccak256(abi.encode(
            DOMAIN_TYPEHASH, keccak256("ProtocolAccount"), keccak256("1"), block.chainid, account
        ));
        return keccak256(abi.encodePacked(hex"1901", domain, hash(intent)));
    }
}
