// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./interfaces/IPredictionMarket.sol";

/**
 * @title PredictionMarket
 * @notice Binary outcome prediction markets settled on Monad.
 *         Designed to receive collateral via Unlink's adapter for private settlement.
 *         All collateral is denominated in a single ERC-20 stablecoin.
 */
contract PredictionMarket is IPredictionMarket {
    address public immutable collateralToken;
    address public owner;
    uint256 public protocolFeeBps; // basis points (e.g. 50 = 0.5%)
    uint256 public accumulatedFees;
    uint256 private _nonce;

    mapping(bytes32 => Market) public markets;
    mapping(bytes32 => mapping(address => uint256)) public yesShares;
    mapping(bytes32 => mapping(address => uint256)) public noShares;

    struct ParlayPosition {
        address holder;
        uint256 totalCost;
        uint256 legCount;
        bool redeemed;
    }

    mapping(bytes32 => ParlayPosition) public parlayPositions;
    mapping(bytes32 => bytes32[]) private _parlayMarketIds;
    mapping(bytes32 => uint256[]) private _parlayShareAmounts;
    uint256 private _parlayNonce;

    event ParlaySharesMinted(bytes32 indexed parlayPositionId, address indexed recipient, uint256 legCount, uint256 totalCost);
    event ParlaySharesRedeemed(bytes32 indexed parlayPositionId, address indexed holder, uint256 payout);

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    modifier marketExists(bytes32 marketId) {
        require(markets[marketId].createdAt != 0, "Market does not exist");
        _;
    }

    constructor(address _collateralToken, uint256 _protocolFeeBps) {
        collateralToken = _collateralToken;
        protocolFeeBps = _protocolFeeBps;
        owner = msg.sender;
    }

    function createMarket(
        string calldata question,
        uint256 expiresAt,
        address oracle
    ) external returns (bytes32) {
        require(expiresAt > block.timestamp, "Expiry must be in the future");
        require(oracle != address(0), "Invalid oracle");

        bytes32 marketId = keccak256(abi.encodePacked(question, expiresAt, oracle, _nonce++));

        markets[marketId] = Market({
            marketId: marketId,
            question: question,
            createdAt: block.timestamp,
            expiresAt: expiresAt,
            status: MarketStatus.Active,
            outcome: Outcome.Unresolved,
            oracle: oracle,
            totalYesShares: 0,
            totalNoShares: 0,
            totalVolume: 0
        });

        emit MarketCreated(marketId, question, expiresAt, oracle);
        return marketId;
    }

    function resolveMarket(bytes32 marketId, Outcome outcome)
        external
        marketExists(marketId)
    {
        Market storage m = markets[marketId];
        require(msg.sender == m.oracle, "Only oracle can resolve");
        require(m.status == MarketStatus.Active, "Market not active");
        require(outcome != Outcome.Unresolved, "Invalid outcome");

        m.status = MarketStatus.Resolved;
        m.outcome = outcome;
        emit MarketResolved(marketId, outcome);
    }

    function cancelMarket(bytes32 marketId)
        external
        marketExists(marketId)
    {
        Market storage m = markets[marketId];
        require(msg.sender == m.oracle || msg.sender == owner, "Unauthorized");
        require(m.status == MarketStatus.Active, "Market not active");

        m.status = MarketStatus.Cancelled;
        emit MarketCancelled(marketId);
    }

    /**
     * @notice Purchase outcome shares. Called by the RFQ contract after a fill.
     * @dev Collateral must already be transferred to this contract before calling.
     */
    function mintShares(
        bytes32 marketId,
        address recipient,
        bool isYes,
        uint256 shares,
        uint256 cost
    ) external marketExists(marketId) {
        Market storage m = markets[marketId];
        require(m.status == MarketStatus.Active, "Market not active");
        require(block.timestamp < m.expiresAt, "Market expired");

        if (isYes) {
            yesShares[marketId][recipient] += shares;
            m.totalYesShares += shares;
        } else {
            noShares[marketId][recipient] += shares;
            m.totalNoShares += shares;
        }
        m.totalVolume += cost;

        emit SharesPurchased(marketId, recipient, isYes, shares, cost);
    }

    /**w
     * @notice Atomically mint Yes shares across multiple markets for a parlay.
     * @dev Collateral must already be transferred to this contract before calling.
     *      All legs are Yes positions. Returns a unique parlayPositionId used for redemption.
     */
    function mintParlayShares(
        bytes32[] calldata marketIds,
        address recipient,
        uint256[] calldata shares,
        uint256[] calldata costs
    ) external returns (bytes32) {
        require(marketIds.length >= 2, "Need >= 2 legs");
        require(
            marketIds.length == shares.length && marketIds.length == costs.length,
            "Array length mismatch"
        );

        uint256 totalCost;
        for (uint256 i = 0; i < marketIds.length; i++) {
            Market storage m = markets[marketIds[i]];
            require(m.createdAt != 0, "Market does not exist");
            require(m.status == MarketStatus.Active, "Market not active");
            require(block.timestamp < m.expiresAt, "Market expired");
            require(shares[i] > 0, "Shares must be > 0");

            yesShares[marketIds[i]][recipient] += shares[i];
            m.totalYesShares += shares[i];
            m.totalVolume += costs[i];
            totalCost += costs[i];

            emit SharesPurchased(marketIds[i], recipient, true, shares[i], costs[i]);
        }

        bytes32 parlayPositionId = keccak256(
            abi.encodePacked(recipient, marketIds.length, block.timestamp, _parlayNonce++)
        );

        parlayPositions[parlayPositionId] = ParlayPosition({
            holder: recipient,
            totalCost: totalCost,
            legCount: marketIds.length,
            redeemed: false
        });

        for (uint256 i = 0; i < marketIds.length; i++) {
            _parlayMarketIds[parlayPositionId].push(marketIds[i]);
            _parlayShareAmounts[parlayPositionId].push(shares[i]);
        }

        emit ParlaySharesMinted(parlayPositionId, recipient, marketIds.length, totalCost);
        return parlayPositionId;
    }

    /**
     * @notice Redeem a parlay position. All legs must have resolved to Yes.
     *         Pays out the sum of all leg shares minus protocol fee.
     */
    function redeemParlayShares(bytes32 parlayPositionId) external {
        ParlayPosition storage pos = parlayPositions[parlayPositionId];
        require(pos.holder != address(0), "Position does not exist");
        require(msg.sender == pos.holder, "Not position holder");
        require(!pos.redeemed, "Already redeemed");

        bytes32[] storage mids = _parlayMarketIds[parlayPositionId];
        uint256[] storage shareAmts = _parlayShareAmounts[parlayPositionId];

        uint256 totalPayout;
        for (uint256 i = 0; i < mids.length; i++) {
            Market storage m = markets[mids[i]];
            require(m.status == MarketStatus.Resolved, "Market not resolved");
            require(m.outcome == Outcome.Yes, "Leg did not resolve Yes");

            uint256 s = shareAmts[i];
            require(yesShares[mids[i]][msg.sender] >= s, "Insufficient shares");
            yesShares[mids[i]][msg.sender] -= s;
            totalPayout += s;
        }

        pos.redeemed = true;

        uint256 fee = (totalPayout * protocolFeeBps) / 10000;
        uint256 payout = totalPayout - fee;
        accumulatedFees += fee;

        (bool ok,) = collateralToken.call(
            abi.encodeWithSignature("transfer(address,uint256)", msg.sender, payout)
        );
        require(ok, "Transfer failed");

        emit ParlaySharesRedeemed(parlayPositionId, msg.sender, payout);
    }

    function getParlayMarketIds(bytes32 parlayPositionId) external view returns (bytes32[] memory) {
        return _parlayMarketIds[parlayPositionId];
    }

    function getParlayShareAmounts(bytes32 parlayPositionId) external view returns (uint256[] memory) {
        return _parlayShareAmounts[parlayPositionId];
    }

    /**
     * @notice Redeem winning shares for collateral after resolution.
     */
    function redeemShares(bytes32 marketId) external marketExists(marketId) {
        Market storage m = markets[marketId];
        require(m.status == MarketStatus.Resolved, "Market not resolved");

        uint256 shares;
        if (m.outcome == Outcome.Yes) {
            shares = yesShares[marketId][msg.sender];
            require(shares > 0, "No winning shares");
            yesShares[marketId][msg.sender] = 0;
        } else {
            shares = noShares[marketId][msg.sender];
            require(shares > 0, "No winning shares");
            noShares[marketId][msg.sender] = 0;
        }

        uint256 fee = (shares * protocolFeeBps) / 10000;
        uint256 payout = shares - fee;
        accumulatedFees += fee;

        (bool ok,) = collateralToken.call(
            abi.encodeWithSignature("transfer(address,uint256)", msg.sender, payout)
        );
        require(ok, "Transfer failed");

        emit SharesRedeemed(marketId, msg.sender, shares, payout);
    }

    /**
     * @notice Refund shares if market is cancelled.
     */
    function refundShares(bytes32 marketId) external marketExists(marketId) {
        Market storage m = markets[marketId];
        require(m.status == MarketStatus.Cancelled, "Market not cancelled");

        uint256 yesAmt = yesShares[marketId][msg.sender];
        uint256 noAmt = noShares[marketId][msg.sender];
        uint256 total = yesAmt + noAmt;
        require(total > 0, "Nothing to refund");

        yesShares[marketId][msg.sender] = 0;
        noShares[marketId][msg.sender] = 0;

        (bool ok,) = collateralToken.call(
            abi.encodeWithSignature("transfer(address,uint256)", msg.sender, total)
        );
        require(ok, "Transfer failed");
    }

    function getMarket(bytes32 marketId) external view returns (Market memory) {
        return markets[marketId];
    }

    function getShares(bytes32 marketId, address user)
        external
        view
        returns (uint256 yes, uint256 no)
    {
        return (yesShares[marketId][user], noShares[marketId][user]);
    }

    function withdrawFees(address to) external onlyOwner {
        uint256 amount = accumulatedFees;
        accumulatedFees = 0;
        (bool ok,) = collateralToken.call(
            abi.encodeWithSignature("transfer(address,uint256)", to, amount)
        );
        require(ok, "Transfer failed");
    }

    function setProtocolFee(uint256 _feeBps) external onlyOwner {
        require(_feeBps <= 1000, "Fee too high");
        protocolFeeBps = _feeBps;
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Invalid owner");
        owner = newOwner;
    }
}
