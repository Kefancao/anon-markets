// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IRFQ {
    enum RFQStatus { Open, Filled, Expired, Cancelled }

    struct QuoteRequest {
        bytes32 requestId;
        address taker;
        bytes32 marketId;
        bool isYes;
        uint256 size;
        uint256 maxPrice;
        uint256 createdAt;
        uint256 expiresAt;
        RFQStatus status;
    }

    struct QuoteResponse {
        bytes32 responseId;
        bytes32 requestId;
        address maker;
        uint256 price;
        uint256 size;
        uint256 createdAt;
        uint256 expiresAt;
        bool filled;
    }

    event QuoteRequested(bytes32 indexed requestId, address indexed taker, bytes32 indexed marketId, bool isYes, uint256 size);
    event QuoteResponded(bytes32 indexed responseId, bytes32 indexed requestId, address indexed maker, uint256 price, uint256 size);
    event QuoteFilled(bytes32 indexed responseId, bytes32 indexed requestId, address taker, address maker, uint256 price, uint256 size);
    event QuoteExpired(bytes32 indexed requestId);
    event QuoteCancelled(bytes32 indexed requestId);

    function requestQuote(bytes32 marketId, bool isYes, uint256 size, uint256 maxPrice, uint256 duration) external returns (bytes32);
    function respondToQuote(bytes32 requestId, uint256 price, uint256 size, uint256 duration) external returns (bytes32);
    function fillQuote(bytes32 responseId) external;
    function cancelQuote(bytes32 requestId) external;
}
