// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IPredictionMarket {
    enum MarketStatus { Active, Paused, Resolved, Cancelled }
    enum Outcome { Unresolved, Yes, No }

    struct Market {
        bytes32 marketId;
        string question;
        uint256 createdAt;
        uint256 expiresAt;
        MarketStatus status;
        Outcome outcome;
        address oracle;
        uint256 totalYesShares;
        uint256 totalNoShares;
        uint256 totalVolume;
    }

    event MarketCreated(bytes32 indexed marketId, string question, uint256 expiresAt, address oracle);
    event MarketResolved(bytes32 indexed marketId, Outcome outcome);
    event MarketCancelled(bytes32 indexed marketId);
    event SharesPurchased(bytes32 indexed marketId, address indexed buyer, bool isYes, uint256 amount, uint256 cost);
    event SharesRedeemed(bytes32 indexed marketId, address indexed redeemer, uint256 shares, uint256 payout);

    function createMarket(string calldata question, uint256 expiresAt, address oracle) external returns (bytes32);
    function resolveMarket(bytes32 marketId, Outcome outcome) external;
    function cancelMarket(bytes32 marketId) external;
    function getMarket(bytes32 marketId) external view returns (Market memory);
}
