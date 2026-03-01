// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title YieldVault
 * @notice Simple vault that accepts stablecoin deposits and distributes yield.
 *         Designed to be called via Unlink's adapter for private yield.
 *         In production, the vault would deploy deposits into a yield source
 *         (lending protocol, LP, etc.). This implementation uses an admin-funded
 *         yield model for simplicity.
 */
contract YieldVault {
    address public immutable stablecoin;
    address public owner;

    uint256 public totalDeposited;
    uint256 public yieldPerShareStored; // scaled by 1e18
    uint256 public lastYieldUpdate;

    mapping(address => uint256) public deposits;
    mapping(address => uint256) public userYieldPerSharePaid;
    mapping(address => uint256) public pendingYield;

    event Deposited(address indexed user, uint256 amount);
    event Withdrawn(address indexed user, uint256 amount);
    event YieldClaimed(address indexed user, uint256 amount);
    event YieldDistributed(uint256 amount);

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    modifier updateYield(address user) {
        if (user != address(0)) {
            pendingYield[user] = earned(user);
            userYieldPerSharePaid[user] = yieldPerShareStored;
        }
        _;
    }

    constructor(address _stablecoin) {
        stablecoin = _stablecoin;
        owner = msg.sender;
        lastYieldUpdate = block.timestamp;
    }

    function deposit(uint256 amount) external updateYield(msg.sender) {
        require(amount > 0, "Amount must be > 0");

        (bool ok,) = stablecoin.call(
            abi.encodeWithSignature(
                "transferFrom(address,address,uint256)",
                msg.sender, address(this), amount
            )
        );
        require(ok, "Transfer failed");

        deposits[msg.sender] += amount;
        totalDeposited += amount;

        emit Deposited(msg.sender, amount);
    }

    function withdraw(uint256 amount) external updateYield(msg.sender) {
        require(amount > 0, "Amount must be > 0");
        require(deposits[msg.sender] >= amount, "Insufficient balance");

        deposits[msg.sender] -= amount;
        totalDeposited -= amount;

        (bool ok,) = stablecoin.call(
            abi.encodeWithSignature("transfer(address,uint256)", msg.sender, amount)
        );
        require(ok, "Transfer failed");

        emit Withdrawn(msg.sender, amount);
    }

    function claimYield() external updateYield(msg.sender) {
        uint256 reward = pendingYield[msg.sender];
        require(reward > 0, "No yield to claim");

        pendingYield[msg.sender] = 0;

        (bool ok,) = stablecoin.call(
            abi.encodeWithSignature("transfer(address,uint256)", msg.sender, reward)
        );
        require(ok, "Transfer failed");

        emit YieldClaimed(msg.sender, reward);
    }

    /**
     * @notice Admin distributes yield (funded externally or from strategy).
     *         Yield is distributed proportionally to all depositors.
     */
    function distributeYield(uint256 amount) external onlyOwner {
        require(totalDeposited > 0, "No deposits");

        (bool ok,) = stablecoin.call(
            abi.encodeWithSignature(
                "transferFrom(address,address,uint256)",
                msg.sender, address(this), amount
            )
        );
        require(ok, "Transfer failed");

        yieldPerShareStored += (amount * 1e18) / totalDeposited;
        lastYieldUpdate = block.timestamp;

        emit YieldDistributed(amount);
    }

    function earned(address user) public view returns (uint256) {
        return
            (deposits[user] * (yieldPerShareStored - userYieldPerSharePaid[user])) /
            1e18 +
            pendingYield[user];
    }

    function getDeposit(address user) external view returns (uint256) {
        return deposits[user];
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Invalid owner");
        owner = newOwner;
    }
}
