// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./RFQEngine.sol";

/**
 * @title ParlayEngine
 * @notice Multi-leg parlay bets across prediction markets.
 *         A parlay groups multiple market positions into one request
 *         that must be filled atomically (all-or-nothing).
 */
contract ParlayEngine {
    RFQEngine public immutable rfqEngine;
    address public immutable collateralToken;
    uint256 private _nonce;

    enum ParlayStatus { Open, Filled, Expired, Cancelled }

    struct ParlayLeg {
        bytes32 marketId;
        bool isYes;
        uint256 size;
    }

    struct ParlayRequest {
        bytes32 parlayId;
        address taker;
        ParlayLeg[] legs;
        uint256 totalSize;
        uint256 maxTotalCost;
        uint256 createdAt;
        uint256 expiresAt;
        ParlayStatus status;
    }

    struct ParlayQuote {
        bytes32 quoteId;
        bytes32 parlayId;
        address maker;
        uint256[] legPrices; // price per leg (1e18 scale)
        uint256 totalCost;
        uint256 createdAt;
        uint256 expiresAt;
        bool filled;
    }

    mapping(bytes32 => ParlayRequest) private _parlays;
    mapping(bytes32 => ParlayLeg[]) private _parlayLegs;
    mapping(bytes32 => ParlayQuote) public parlayQuotes;
    mapping(bytes32 => uint256[]) private _quotePrices;
    mapping(bytes32 => bytes32[]) public parlayResponses;

    uint256 public totalParlayCount;
    uint256 public totalParlayFilled;

    event ParlayRequested(bytes32 indexed parlayId, address indexed taker, uint256 legCount, uint256 totalSize);
    event ParlayQuoted(bytes32 indexed quoteId, bytes32 indexed parlayId, address indexed maker, uint256 totalCost);
    event ParlayFilled(bytes32 indexed quoteId, bytes32 indexed parlayId, address taker, address maker);
    event ParlayCancelled(bytes32 indexed parlayId);

    constructor(address _rfqEngine, address _collateralToken) {
        rfqEngine = RFQEngine(_rfqEngine);
        collateralToken = _collateralToken;
    }

    function requestParlay(
        ParlayLeg[] calldata legs,
        uint256 maxTotalCost,
        uint256 duration
    ) external returns (bytes32) {
        require(legs.length >= 2, "Parlay needs >= 2 legs");
        require(legs.length <= 12, "Too many legs");
        require(maxTotalCost > 0, "Invalid max cost");
        require(duration > 0 && duration <= 1 days, "Invalid duration");

        bytes32 parlayId = keccak256(
            abi.encodePacked(msg.sender, legs.length, block.timestamp, _nonce++)
        );

        uint256 totalSize;
        for (uint256 i = 0; i < legs.length; i++) {
            require(legs[i].size > 0, "Leg size must be > 0");
            _parlayLegs[parlayId].push(legs[i]);
            totalSize += legs[i].size;
        }

        _parlays[parlayId] = ParlayRequest({
            parlayId: parlayId,
            taker: msg.sender,
            legs: new ParlayLeg[](0), // stored in _parlayLegs
            totalSize: totalSize,
            maxTotalCost: maxTotalCost,
            createdAt: block.timestamp,
            expiresAt: block.timestamp + duration,
            status: ParlayStatus.Open
        });

        totalParlayCount++;
        emit ParlayRequested(parlayId, msg.sender, legs.length, totalSize);
        return parlayId;
    }

    function quoteParlay(
        bytes32 parlayId,
        uint256[] calldata legPrices,
        uint256 duration
    ) external returns (bytes32) {
        ParlayRequest storage parlay = _parlays[parlayId];
        require(parlay.createdAt != 0, "Parlay does not exist");
        require(parlay.status == ParlayStatus.Open, "Parlay not open");
        require(block.timestamp < parlay.expiresAt, "Parlay expired");

        ParlayLeg[] storage legs = _parlayLegs[parlayId];
        require(legPrices.length == legs.length, "Price count mismatch");

        uint256 totalCost;
        for (uint256 i = 0; i < legPrices.length; i++) {
            require(legPrices[i] > 0 && legPrices[i] <= 1e18, "Invalid leg price");
            totalCost += (legPrices[i] * legs[i].size) / 1e18;
        }
        require(totalCost <= parlay.maxTotalCost, "Cost exceeds max");

        bytes32 quoteId = keccak256(
            abi.encodePacked(msg.sender, parlayId, totalCost, block.timestamp, _nonce++)
        );

        parlayQuotes[quoteId] = ParlayQuote({
            quoteId: quoteId,
            parlayId: parlayId,
            maker: msg.sender,
            legPrices: new uint256[](0), // stored in _quotePrices
            totalCost: totalCost,
            createdAt: block.timestamp,
            expiresAt: block.timestamp + duration,
            filled: false
        });

        for (uint256 i = 0; i < legPrices.length; i++) {
            _quotePrices[quoteId].push(legPrices[i]);
        }

        parlayResponses[parlayId].push(quoteId);
        emit ParlayQuoted(quoteId, parlayId, msg.sender, totalCost);
        return quoteId;
    }

    function fillParlay(bytes32 quoteId) external {
        ParlayQuote storage quote = parlayQuotes[quoteId];
        require(quote.createdAt != 0, "Quote does not exist");
        require(!quote.filled, "Already filled");
        require(block.timestamp < quote.expiresAt, "Quote expired");

        ParlayRequest storage parlay = _parlays[quote.parlayId];
        require(parlay.status == ParlayStatus.Open, "Parlay not open");
        require(msg.sender == parlay.taker, "Only taker can fill");

        quote.filled = true;
        parlay.status = ParlayStatus.Filled;

        // Transfer taker's total cost
        (bool ok1,) = collateralToken.call(
            abi.encodeWithSignature(
                "transferFrom(address,address,uint256)",
                msg.sender, address(rfqEngine.predictionMarket()), quote.totalCost
            )
        );
        require(ok1, "Taker transfer failed");

        ParlayLeg[] storage legs = _parlayLegs[quote.parlayId];
        uint256[] storage prices = _quotePrices[quoteId];

        uint256 makerTotalCost;
        for (uint256 i = 0; i < legs.length; i++) {
            uint256 legCost = (prices[i] * legs[i].size) / 1e18;
            uint256 makerLegCost = legs[i].size - legCost;
            makerTotalCost += makerLegCost;
        }

        // Transfer maker's counter-collateral
        (bool ok2,) = collateralToken.call(
            abi.encodeWithSignature(
                "transferFrom(address,address,uint256)",
                quote.maker, address(rfqEngine.predictionMarket()), makerTotalCost
            )
        );
        require(ok2, "Maker transfer failed");

        // Mint shares for each leg
        PredictionMarket pm = rfqEngine.predictionMarket();
        for (uint256 i = 0; i < legs.length; i++) {
            uint256 legCost = (prices[i] * legs[i].size) / 1e18;
            uint256 makerLegCost = legs[i].size - legCost;
            pm.mintShares(legs[i].marketId, parlay.taker, legs[i].isYes, legs[i].size, legCost);
            pm.mintShares(legs[i].marketId, quote.maker, !legs[i].isYes, legs[i].size, makerLegCost);
        }

        totalParlayFilled++;
        emit ParlayFilled(quoteId, quote.parlayId, parlay.taker, quote.maker);
    }

    function cancelParlay(bytes32 parlayId) external {
        ParlayRequest storage parlay = _parlays[parlayId];
        require(parlay.taker == msg.sender, "Only taker can cancel");
        require(parlay.status == ParlayStatus.Open, "Not open");

        parlay.status = ParlayStatus.Cancelled;
        emit ParlayCancelled(parlayId);
    }

    function getParlay(bytes32 parlayId) external view returns (
        address taker,
        uint256 totalSize,
        uint256 maxTotalCost,
        uint256 createdAt,
        uint256 expiresAt,
        ParlayStatus status,
        uint256 legCount
    ) {
        ParlayRequest storage p = _parlays[parlayId];
        return (
            p.taker, p.totalSize, p.maxTotalCost,
            p.createdAt, p.expiresAt, p.status,
            _parlayLegs[parlayId].length
        );
    }

    function getParlayLeg(bytes32 parlayId, uint256 index) external view returns (ParlayLeg memory) {
        return _parlayLegs[parlayId][index];
    }

    function getQuotePrices(bytes32 quoteId) external view returns (uint256[] memory) {
        return _quotePrices[quoteId];
    }
}
