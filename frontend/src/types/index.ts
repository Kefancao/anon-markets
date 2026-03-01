export interface Market {
  marketId: string;
  question: string;
  createdAt: number;
  expiresAt: number;
  status: MarketStatus;
  outcome: Outcome;
  oracle: string;
  totalYesShares: string;
  totalNoShares: string;
  totalVolume: string;
  yesPrice: number;
  noPrice: number;
}

export enum MarketStatus {
  Active = 0,
  Paused = 1,
  Resolved = 2,
  Cancelled = 3,
}

export enum Outcome {
  Unresolved = 0,
  Yes = 1,
  No = 2,
}

export interface RFQRequest {
  requestId: string;
  taker: string;
  marketId: string;
  isYes: boolean;
  size: string;
  maxPrice: string;
  createdAt: number;
  expiresAt: number;
  status: number;
  responses: RFQResponse[];
}

export interface RFQResponse {
  responseId: string;
  requestId: string;
  maker: string;
  price: string;
  size: string;
  createdAt: number;
  expiresAt: number;
  filled: boolean;
}

export interface GlobalStats {
  totalRFQCount: number;
  totalFilledCount: number;
  totalVolume: string;
  lastRFQTimestamp: number;
  quoteToFillRatioBps: number;
}

export interface MakerStats {
  address: string;
  responseCount: number;
  fillCount: number;
  avgResponseTime: number;
  acceptanceRateBps: number;
}

export interface RecentFill {
  responseId: string;
  requestId: string;
  price: string;
  size: string;
  timestamp: number;
}

/** Fill record from backend (tx hash + market + amount + side) for Recent Fills panel */
export interface FillRecord {
  id: string;
  txHash: string;
  marketId: string;
  question: string;
  amountUsd: number;
  side: "yes" | "no";
  shares: string;
}

/** On-chain position for a market (adapter's yes/no shares) */
export interface Position {
  marketId: string;
  question: string;
  yesShares: string;
  noShares: string;
  status: number;
  outcome: number;
}

export interface ParlayLeg {
  marketId: string;
  isYes: boolean;
  size: string;
}

/** Parlay position from PredictionMarket.mintParlayShares (has legs, redeemable when all resolve Yes) */
export interface ParlayPositionDisplay {
  parlayPositionId: string;
  totalCost: string;
  legCount: number;
  legs: { marketId: string; question: string; shares: string }[];
}
