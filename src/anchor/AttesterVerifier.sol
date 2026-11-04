// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {Checkpoints} from "./Checkpoint.sol";
import {IVerifier} from "./IVerifier.sol";

/// @notice Trusted fixed committee. Slashing detects equivocation only. A dishonest
/// threshold can attest to a false but internally consistent checkpoint.
contract AttesterVerifier is IVerifier, EIP712 {
    uint256 public constant UNBONDING_DELAY = 7 days;
    uint256 public immutable threshold;
    uint256 public immutable minimumBond;

    struct Member {
        bool exists;
        bool slashed;
        uint256 stake;
        uint256 withdrawAt;
    }

    mapping(address => Member) public members;
    mapping(address => uint256) public rewards;
    error InvalidMember();
    error InvalidEvidence();
    error TransferFailed();

    constructor(address[] memory attesters, uint256 quorum, uint256 minimum) EIP712("AttesterVerifier", "1") {
        if (quorum == 0 || quorum > attesters.length || minimum == 0) revert InvalidMember();
        threshold = quorum;
        minimumBond = minimum;
        for (uint256 i; i < attesters.length; ++i) {
            address signer = attesters[i];
            if (signer == address(0) || members[signer].exists) revert InvalidMember();
            members[signer].exists = true;
        }
    }

    function bond() external payable {
        Member storage member = members[msg.sender];
        if (!member.exists || member.slashed || member.withdrawAt != 0 || msg.value == 0) revert InvalidMember();
        member.stake += msg.value;
    }

    function beginUnbonding() external {
        Member storage member = members[msg.sender];
        if (member.stake == 0 || member.slashed || member.withdrawAt != 0) revert InvalidMember();
        member.withdrawAt = block.timestamp + UNBONDING_DELAY;
    }

    function withdrawBond() external {
        Member storage member = members[msg.sender];
        if (member.slashed || member.withdrawAt == 0 || block.timestamp < member.withdrawAt) revert InvalidMember();
        uint256 stake = member.stake;
        member.stake = 0;
        member.withdrawAt = 0;
        _pay(msg.sender, stake);
    }

    function trustLevel() external pure returns (string memory) { return "attested"; }

    function hashCheckpoint(Checkpoints.Checkpoint calldata cp) public view returns (bytes32) {
        return _hashTypedDataV4(Checkpoints.hash(cp));
    }

    /// @dev Signatures must be supplied in strictly increasing signer-address order.
    function verify(Checkpoints.Checkpoint calldata cp, bytes calldata evidence) external view returns (bool) {
        bytes[] memory signatures = abi.decode(evidence, (bytes[]));
        if (signatures.length < threshold) return false;
        bytes32 digest = hashCheckpoint(cp);
        address previous;
        for (uint256 i; i < signatures.length; ++i) {
            (address signer, ECDSA.RecoverError error,) = ECDSA.tryRecover(digest, signatures[i]);
            Member storage member = members[signer];
            if (error != ECDSA.RecoverError.NoError || signer <= previous || member.slashed
                || member.withdrawAt != 0 || member.stake < minimumBond) return false;
            previous = signer;
        }
        return true;
    }

    function slashEquivocation(
        Checkpoints.Checkpoint calldata a, bytes calldata sigA,
        Checkpoints.Checkpoint calldata b, bytes calldata sigB
    ) external {
        if (a.sourceChainId != b.sourceChainId || a.settler != b.settler || a.fromReceiptIndex != b.fromReceiptIndex
            || (a.endAccumulator == b.endAccumulator && a.receiptsRoot == b.receiptsRoot)) revert InvalidEvidence();
        address signer = ECDSA.recover(hashCheckpoint(a), sigA);
        if (signer != ECDSA.recover(hashCheckpoint(b), sigB)) revert InvalidEvidence();
        Member storage member = members[signer];
        uint256 stake = member.stake;
        if (!member.exists || member.slashed || stake == 0) revert InvalidMember();
        member.slashed = true;
        member.stake = 0;
        uint256 reporterShare = stake / 2;
        rewards[msg.sender] += reporterShare;
        _pay(address(0), stake - reporterShare);
    }

    function withdrawReward() external {
        uint256 reward = rewards[msg.sender];
        rewards[msg.sender] = 0;
        _pay(msg.sender, reward);
    }

    function _pay(address to, uint256 value) private {
        (bool success,) = payable(to).call{value: value}("");
        if (!success) revert TransferFailed();
    }
}
