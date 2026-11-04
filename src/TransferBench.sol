// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @notice EVM benchmark workload. Each call updates balances, preserving the same
/// balances as the baseline. This is not a replacement for ERC-20 transfer semantics.
contract TransferBench {
    mapping(address => uint256) public balances;
    event Moved(address indexed to, uint256 amount);
    constructor(uint256 supply) { balances[msg.sender] = supply; }
    function transferOne(address to, uint256 amount) external {
        require(to != address(0), "zero address");
        uint256 bal = balances[msg.sender];
        require(bal >= amount, "insufficient");
        unchecked { balances[msg.sender] = bal - amount; }
        balances[to] += amount;
        emit Moved(to, amount);
    }
    /// @dev Saves repeated sender balance SSTORE, but still emits identical logs.
    /// Recipients must be distinct from sender. Duplicate recipients are supported.
    function transferBatch(address[] calldata recipients, uint256[] calldata amounts) external {
        uint256 n = recipients.length;
        require(n == amounts.length, "length mismatch");
        uint256 total;
        for (uint256 i; i < n; ++i) {
            require(recipients[i] != address(0) && recipients[i] != msg.sender, "invalid recipient");
            total += amounts[i];
        }
        uint256 bal = balances[msg.sender];
        require(bal >= total, "insufficient");
        unchecked { balances[msg.sender] = bal - total; }
        for (uint256 i; i < n; ++i) {
            balances[recipients[i]] += amounts[i];
            emit Moved(recipients[i], amounts[i]);
        }
    }
}
