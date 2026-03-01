export const PredictionMarketABI = [
  "function createMarket(string question, uint256 expiresAt, address oracle) returns (bytes32)",
  "function resolveMarket(bytes32 marketId, uint8 outcome)",
  "function cancelMarket(bytes32 marketId)",
  "function getMarket(bytes32 marketId) view returns (tuple(bytes32 marketId, string question, uint256 createdAt, uint256 expiresAt, uint8 status, uint8 outcome, address oracle, uint256 totalYesShares, uint256 totalNoShares, uint256 totalVolume))",
  "function getShares(bytes32 marketId, address user) view returns (uint256 yes, uint256 no)",
  "function mintShares(bytes32 marketId, address recipient, bool isYes, uint256 shares, uint256 cost)",
  "function redeemShares(bytes32 marketId)",
  "function refundShares(bytes32 marketId)",
  "function protocolFeeBps() view returns (uint256)",
  "event MarketCreated(bytes32 indexed marketId, string question, uint256 expiresAt, address oracle)",
  "event MarketResolved(bytes32 indexed marketId, uint8 outcome)",
  "event SharesPurchased(bytes32 indexed marketId, address indexed buyer, bool isYes, uint256 amount, uint256 cost)",
] as const;

export const RFQEngineABI = [
  "function requestQuote(bytes32 marketId, bool isYes, uint256 size, uint256 maxPrice, uint256 duration) returns (bytes32)",
  "function respondToQuote(bytes32 requestId, uint256 price, uint256 size, uint256 duration) returns (bytes32)",
  "function fillQuote(bytes32 responseId)",
  "function cancelQuote(bytes32 requestId)",
  "function getRequest(bytes32 requestId) view returns (tuple(bytes32 requestId, address taker, bytes32 marketId, bool isYes, uint256 size, uint256 maxPrice, uint256 createdAt, uint256 expiresAt, uint8 status))",
  "function getResponse(bytes32 responseId) view returns (tuple(bytes32 responseId, bytes32 requestId, address maker, uint256 price, uint256 size, uint256 createdAt, uint256 expiresAt, bool filled))",
  "function getRequestResponses(bytes32 requestId) view returns (bytes32[])",
  "function getMakerStats(address maker) view returns (uint256 responseCount, uint256 fillCount, uint256 avgResponseTime, uint256 acceptanceRate)",
  "function getGlobalStats() view returns (uint256 totalRFQCount, uint256 totalFilledCount, uint256 totalVolume, uint256 lastRFQTimestamp, uint256 quoteToFillRatio)",
  "event QuoteRequested(bytes32 indexed requestId, address indexed taker, bytes32 indexed marketId, bool isYes, uint256 size)",
  "event QuoteResponded(bytes32 indexed responseId, bytes32 indexed requestId, address indexed maker, uint256 price, uint256 size)",
  "event QuoteFilled(bytes32 indexed responseId, bytes32 indexed requestId, address taker, address maker, uint256 price, uint256 size)",
] as const;

export const ParlayEngineABI = [
  "function requestParlay(tuple(bytes32 marketId, bool isYes, uint256 size)[] legs, uint256 maxTotalCost, uint256 duration) returns (bytes32)",
  "function quoteParlay(bytes32 parlayId, uint256[] legPrices, uint256 duration) returns (bytes32)",
  "function fillParlay(bytes32 quoteId)",
  "function cancelParlay(bytes32 parlayId)",
  "function getParlay(bytes32 parlayId) view returns (address taker, uint256 totalSize, uint256 maxTotalCost, uint256 createdAt, uint256 expiresAt, uint8 status, uint256 legCount)",
  "function getParlayLeg(bytes32 parlayId, uint256 index) view returns (tuple(bytes32 marketId, bool isYes, uint256 size))",
  "function totalParlayCount() view returns (uint256)",
  "function totalParlayFilled() view returns (uint256)",
  "event ParlayRequested(bytes32 indexed parlayId, address indexed taker, uint256 legCount, uint256 totalSize)",
  "event ParlayQuoted(bytes32 indexed quoteId, bytes32 indexed parlayId, address indexed maker, uint256 totalCost)",
  "event ParlayFilled(bytes32 indexed quoteId, bytes32 indexed parlayId, address taker, address maker)",
] as const;

export const YieldVaultABI = [
  "function deposit(uint256 amount)",
  "function withdraw(uint256 amount)",
  "function claimYield()",
  "function earned(address user) view returns (uint256)",
  "function getDeposit(address user) view returns (uint256)",
  "function totalDeposited() view returns (uint256)",
  "function yieldPerShareStored() view returns (uint256)",
] as const;

export const ERC20ABI = [
  "function approve(address spender, uint256 amount) returns (bool)",
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
] as const;
