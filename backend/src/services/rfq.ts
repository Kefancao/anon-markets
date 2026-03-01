import { getRFQEngineContract } from "./chain.js";
import { handleIncomingRFQ } from "./amm.js";

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

export interface MakerStats {
  address: string;
  responseCount: number;
  fillCount: number;
  avgResponseTime: number;
  acceptanceRateBps: number;
}

export interface GlobalStats {
  totalRFQCount: number;
  totalFilledCount: number;
  totalVolume: string;
  lastRFQTimestamp: number;
  quoteToFillRatioBps: number;
}

// In-memory cache for active RFQs — refreshed from chain events
const activeRequests = new Map<string, RFQRequest>();
const recentFills: Array<{
  responseId: string;
  requestId: string;
  price: string;
  size: string;
  timestamp: number;
}> = [];

export async function getGlobalStats(): Promise<GlobalStats> {
  try {
    const rfq = getRFQEngineContract();
    if (!rfq) throw new Error("Contract not configured");
    const [totalRFQCount, totalFilledCount, totalVolume, lastRFQTimestamp, quoteToFillRatio] =
      await rfq.getGlobalStats();
    return {
      totalRFQCount: Number(totalRFQCount),
      totalFilledCount: Number(totalFilledCount),
      totalVolume: totalVolume.toString(),
      lastRFQTimestamp: Number(lastRFQTimestamp),
      quoteToFillRatioBps: Number(quoteToFillRatio),
    };
  } catch {
    return {
      totalRFQCount: activeRequests.size,
      totalFilledCount: recentFills.length,
      totalVolume: "0",
      lastRFQTimestamp: 0,
      quoteToFillRatioBps: 0,
    };
  }
}

export async function getMakerStats(makerAddress: string): Promise<MakerStats> {
  try {
    const rfq = getRFQEngineContract();
    if (!rfq) throw new Error("Contract not configured");
    const [responseCount, fillCount, avgResponseTime, acceptanceRate] =
      await rfq.getMakerStats(makerAddress);
    return {
      address: makerAddress,
      responseCount: Number(responseCount),
      fillCount: Number(fillCount),
      avgResponseTime: Number(avgResponseTime),
      acceptanceRateBps: Number(acceptanceRate),
    };
  } catch {
    return {
      address: makerAddress,
      responseCount: 0,
      fillCount: 0,
      avgResponseTime: 0,
      acceptanceRateBps: 0,
    };
  }
}

export function getActiveRequests(): RFQRequest[] {
  const now = Math.floor(Date.now() / 1000);
  return Array.from(activeRequests.values()).filter(
    (r) => r.status === 0 && r.expiresAt > now
  );
}

export function getRecentFills(limit = 50) {
  return recentFills.slice(-limit);
}

export function startRFQEventListener() {
  try {
    const rfq = getRFQEngineContract();
    if (!rfq) {
      console.log("[RFQ] No contract address configured — event listener skipped");
      return;
    }

    rfq.on("QuoteRequested", (requestId, taker, marketId, isYes, size) => {
      console.log(`[RFQ] New request: ${requestId}`);
      activeRequests.set(requestId, {
        requestId,
        taker,
        marketId,
        isYes,
        size: size.toString(),
        maxPrice: "0",
        createdAt: Math.floor(Date.now() / 1000),
        expiresAt: Math.floor(Date.now() / 1000) + 300,
        status: 0,
        responses: [],
      });

      handleIncomingRFQ(requestId, marketId, isYes, size.toString());
    });

    rfq.on("QuoteResponded", (responseId, requestId, maker, price, size) => {
      console.log(`[RFQ] New response: ${responseId} for ${requestId}`);
      const req = activeRequests.get(requestId);
      if (req) {
        req.responses.push({
          responseId,
          requestId,
          maker,
          price: price.toString(),
          size: size.toString(),
          createdAt: Math.floor(Date.now() / 1000),
          expiresAt: Math.floor(Date.now() / 1000) + 120,
          filled: false,
        });
      }
    });

    rfq.on("QuoteFilled", (responseId, requestId, _taker, _maker, price, size) => {
      console.log(`[RFQ] Filled: ${responseId}`);
      const req = activeRequests.get(requestId);
      if (req) req.status = 1;
      recentFills.push({
        responseId,
        requestId,
        price: price.toString(),
        size: size.toString(),
        timestamp: Math.floor(Date.now() / 1000),
      });
      if (recentFills.length > 200) recentFills.shift();
    });

    console.log("[RFQ] Event listener started");
  } catch (e) {
    console.warn("[RFQ] Could not start event listener (contracts may not be deployed):", e);
  }
}
