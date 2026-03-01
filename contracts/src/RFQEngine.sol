// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./interfaces/IRFQ.sol";
import "./PredictionMarket.sol";

/**
 * @title RFQEngine
 * @notice Request-for-quote engine for prediction market shares.
 *         Takers request quotes; makers respond with prices.
 *         On fill, collateral moves through this contract to the PredictionMarket.
 *
 *         When used with Unlink's adapter, taker/maker addresses are the adapter
 *         contract itself, keeping the real user identities private.
 */
contract RFQEngine is IRFQ {
    PredictionMarket public immutable predictionMarket;
    address public immutable collateralToken;
    uint256 private _nonce;

    mapping(bytes32 => QuoteRequest) public requests;
    mapping(bytes32 => QuoteResponse) public responses;
    mapping(bytes32 => bytes32[]) public requestResponses;

    // Public analytics (privacy-safe aggregate data)
    uint256 public totalRFQCount;
    uint256 public totalFilledCount;
    uint256 public totalVolume;
    uint256 public lastRFQTimestamp;

    // Per-maker public stats (address is adapter address when used with Unlink)
    mapping(address => uint256) public makerResponseCount;
    mapping(address => uint256) public makerFillCount;
    mapping(address => uint256) public makerTotalResponseTime;
    mapping(address => uint256) public makerLastResponseTime;

    constructor(address _predictionMarket, address _collateralToken) {
        predictionMarket = PredictionMarket(_predictionMarket);
        collateralToken = _collateralToken;
    }

    function requestQuote(
        bytes32 marketId,
        bool isYes,
        uint256 size,
        uint256 maxPrice,
        uint256 duration
    ) external returns (bytes32) {
        require(size > 0, "Size must be > 0");
        require(maxPrice > 0 && maxPrice <= 1e18, "Invalid max price");
        require(duration > 0 && duration <= 1 days, "Invalid duration");

        bytes32 requestId = keccak256(
            abi.encodePacked(msg.sender, marketId, isYes, size, block.timestamp, _nonce++)
        );

        requests[requestId] = QuoteRequest({
            requestId: requestId,
            taker: msg.sender,
            marketId: marketId,
            isYes: isYes,
            size: size,
            maxPrice: maxPrice,
            createdAt: block.timestamp,
            expiresAt: block.timestamp + duration,
            status: RFQStatus.Open
        });

        totalRFQCount++;
        lastRFQTimestamp = block.timestamp;

        emit QuoteRequested(requestId, msg.sender, marketId, isYes, size);
        return requestId;
    }

    function respondToQuote(
        bytes32 requestId,
        uint256 price,
        uint256 size,
        uint256 duration
    ) external returns (bytes32) {
        QuoteRequest storage req = requests[requestId];
        require(req.createdAt != 0, "Request does not exist");
        require(req.status == RFQStatus.Open, "Request not open");
        require(block.timestamp < req.expiresAt, "Request expired");
        require(price > 0 && price <= req.maxPrice, "Price exceeds max");
        require(size > 0 && size <= req.size, "Invalid size");
        require(duration > 0, "Invalid duration");

        bytes32 responseId = keccak256(
            abi.encodePacked(msg.sender, requestId, price, size, block.timestamp, _nonce++)
        );

        responses[responseId] = QuoteResponse({
            responseId: responseId,
            requestId: requestId,
            maker: msg.sender,
            price: price,
            size: size,
            createdAt: block.timestamp,
            expiresAt: block.timestamp + duration,
            filled: false
        });

        requestResponses[requestId].push(responseId);

        uint256 responseTime = block.timestamp - req.createdAt;
        makerResponseCount[msg.sender]++;
        makerTotalResponseTime[msg.sender] += responseTime;
        makerLastResponseTime[msg.sender] = block.timestamp;

        emit QuoteResponded(responseId, requestId, msg.sender, price, size);
        return responseId;
    }

    function fillQuote(bytes32 responseId) external {
        QuoteResponse storage resp = responses[responseId];
        require(resp.createdAt != 0, "Response does not exist");
        require(!resp.filled, "Already filled");
        require(block.timestamp < resp.expiresAt, "Response expired");

        QuoteRequest storage req = requests[resp.requestId];
        require(req.status == RFQStatus.Open, "Request not open");
        require(msg.sender == req.taker, "Only taker can fill");

        resp.filled = true;
        req.status = RFQStatus.Filled;

        uint256 cost = (resp.price * resp.size) / 1e18;

        // Transfer collateral from taker
        (bool ok1,) = collateralToken.call(
            abi.encodeWithSignature(
                "transferFrom(address,address,address,uint256)",
                msg.sender, address(predictionMarket), cost
            )
        );
        // Fallback to standard transferFrom
        if (!ok1) {
            (ok1,) = collateralToken.call(
                abi.encodeWithSignature(
                    "transferFrom(address,address,uint256)",
                    msg.sender, address(predictionMarket), cost
                )
            );
        }
        require(ok1, "Taker collateral transfer failed");

        // Transfer collateral from maker (counter-party)
        uint256 makerCost = resp.size - cost;
        (bool ok2,) = collateralToken.call(
            abi.encodeWithSignature(
                "transferFrom(address,address,uint256)",
                resp.maker, address(predictionMarket), makerCost
            )
        );
        require(ok2, "Maker collateral transfer failed");

        // Mint shares: taker gets chosen side, maker gets opposite
        predictionMarket.mintShares(req.marketId, req.taker, req.isYes, resp.size, cost);
        predictionMarket.mintShares(req.marketId, resp.maker, !req.isYes, resp.size, makerCost);

        totalFilledCount++;
        totalVolume += resp.size;
        makerFillCount[resp.maker]++;

        emit QuoteFilled(responseId, resp.requestId, req.taker, resp.maker, resp.price, resp.size);
    }

    function cancelQuote(bytes32 requestId) external {
        QuoteRequest storage req = requests[requestId];
        require(req.taker == msg.sender, "Only taker can cancel");
        require(req.status == RFQStatus.Open, "Request not open");

        req.status = RFQStatus.Cancelled;
        emit QuoteCancelled(requestId);
    }

    // --- View functions for public analytics ---

    function getRequest(bytes32 requestId) external view returns (QuoteRequest memory) {
        return requests[requestId];
    }

    function getResponse(bytes32 responseId) external view returns (QuoteResponse memory) {
        return responses[responseId];
    }

    function getRequestResponses(bytes32 requestId) external view returns (bytes32[] memory) {
        return requestResponses[requestId];
    }

    function getMakerStats(address maker) external view returns (
        uint256 responseCount,
        uint256 fillCount,
        uint256 avgResponseTime,
        uint256 acceptanceRate
    ) {
        responseCount = makerResponseCount[maker];
        fillCount = makerFillCount[maker];
        avgResponseTime = responseCount > 0
            ? makerTotalResponseTime[maker] / responseCount
            : 0;
        acceptanceRate = responseCount > 0
            ? (fillCount * 10000) / responseCount
            : 0;
    }

    function getGlobalStats() external view returns (
        uint256 _totalRFQCount,
        uint256 _totalFilledCount,
        uint256 _totalVolume,
        uint256 _lastRFQTimestamp,
        uint256 quoteToFillRatio
    ) {
        _totalRFQCount = totalRFQCount;
        _totalFilledCount = totalFilledCount;
        _totalVolume = totalVolume;
        _lastRFQTimestamp = lastRFQTimestamp;
        quoteToFillRatio = totalRFQCount > 0
            ? (totalFilledCount * 10000) / totalRFQCount
            : 0;
    }
}
