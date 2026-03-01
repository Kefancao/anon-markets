import { getMarket, type MarketInfo } from "./markets.js";
import { broadcastRFQEvent } from "./websocket.js";

/**
 * Automated Market Maker that responds to RFQ requests.
 *
 * Pricing model:
 *   - Base price comes from the market's implied probability (share ratio).
 *   - Spread is applied on top (configurable, default 2%).
 *   - Size impact: larger orders get slightly worse prices.
 *   - Time decay: markets closer to expiry have wider spreads.
 *
 * The AMM doesn't execute on-chain — it returns an off-chain quote
 * that the taker can choose to accept. On acceptance, the fill is
 * routed through the Unlink adapter for private settlement.
 */

interface AMMConfig {
  baseSpreadBps: number;
  maxSpreadBps: number;
  sizeImpactBps: number;
  maxSizeUsd: number;
  minQuoteUsd: number;
  quoteTtlSeconds: number;
}

const DEFAULT_CONFIG: AMMConfig = {
  baseSpreadBps: 200,
  maxSpreadBps: 800,
  sizeImpactBps: 10,
  maxSizeUsd: 50_000,
  minQuoteUsd: 1,
  quoteTtlSeconds: 30,
};

export interface AMMQuote {
  quoteId: string;
  marketId: string;
  side: "yes" | "no";
  requestedSize: number;
  filledSize: number;
  price: number;
  totalCost: number;
  potentialPayout: number;
  spreadBps: number;
  expiresAt: number;
  createdAt: number;
  midPrice: number;
}

export interface ParlayLegInput {
  marketId: string;
  side: "yes" | "no";
}

export interface ParlayAMMQuote {
  quoteId: string;
  legs: { marketId: string; side: "yes" | "no" }[];
  requestedSize: number;
  filledSize: number;
  price: number;
  totalCost: number;
  potentialPayout: number;
  spreadBps: number;
  midPrice: number;
  expiresAt: number;
  createdAt: number;
}

let quoteNonce = 0;
const activeQuotes = new Map<string, AMMQuote>();
const activeParlayQuotes = new Map<string, ParlayAMMQuote>();

setInterval(() => {
  const now = Math.floor(Date.now() / 1000);
  for (const [id, q] of activeQuotes) {
    if (q.expiresAt < now) activeQuotes.delete(id);
  }
  for (const [id, q] of activeParlayQuotes) {
    if (q.expiresAt < now) activeParlayQuotes.delete(id);
  }
}, 10_000);

function computeSpread(
  market: MarketInfo,
  sizeUsd: number,
  config: AMMConfig
): number {
  const now = Math.floor(Date.now() / 1000);
  const timeToExpiry = Math.max(0, market.expiresAt - now);
  const hoursToExpiry = timeToExpiry / 3600;

  let spread = config.baseSpreadBps;

  // Wider spread for larger orders
  const sizeRatio = Math.min(sizeUsd / config.maxSizeUsd, 1);
  spread += sizeRatio * config.sizeImpactBps * 10;

  // Wider spread near expiry (within 24h)
  if (hoursToExpiry < 24) {
    const expiryMultiplier = 1 + (1 - hoursToExpiry / 24) * 2;
    spread *= expiryMultiplier;
  }

  // Wider spread for extreme probabilities (near 0 or 1)
  const midPrice = market.yesPrice;
  const extremity = 1 - 4 * Math.abs(midPrice - 0.5);
  spread += extremity * 100;

  return Math.min(Math.round(spread), config.maxSpreadBps);
}

function computePrice(
  market: MarketInfo,
  side: "yes" | "no",
  sizeUsd: number,
  config: AMMConfig = DEFAULT_CONFIG
): { price: number; spreadBps: number; midPrice: number } {
  const midPrice = side === "yes" ? market.yesPrice : market.noPrice;
  const spreadBps = computeSpread(market, sizeUsd, config);
  const halfSpread = spreadBps / 20000;

  // Taker buys → price goes up (worse for taker)
  const price = Math.min(0.99, Math.max(0.01, midPrice + halfSpread));

  return { price, spreadBps, midPrice };
}

export function getAMMQuote(
  marketId: string,
  side: "yes" | "no",
  sizeUsd: number,
  config: AMMConfig = DEFAULT_CONFIG
): AMMQuote | { error: string } {
  const market = getMarket(marketId);
  if (!market) return { error: "Market not found" };
  if (market.status !== 0) return { error: "Market not active" };

  const now = Math.floor(Date.now() / 1000);
  if (market.expiresAt <= now) return { error: "Market expired" };
  if (sizeUsd < config.minQuoteUsd) return { error: `Minimum size is $${config.minQuoteUsd}` };
  if (sizeUsd > config.maxSizeUsd) return { error: `Maximum size is $${config.maxSizeUsd}` };

  const { price, spreadBps, midPrice } = computePrice(market, side, sizeUsd, config);
  const totalCost = price * sizeUsd;
  const potentialPayout = sizeUsd;

  const quoteId = `amm-${Date.now()}-${++quoteNonce}`;
  const quote: AMMQuote = {
    quoteId,
    marketId,
    side,
    requestedSize: sizeUsd,
    filledSize: sizeUsd,
    price: Math.round(price * 10000) / 10000,
    totalCost: Math.round(totalCost * 100) / 100,
    potentialPayout: Math.round(potentialPayout * 100) / 100,
    spreadBps,
    expiresAt: now + config.quoteTtlSeconds,
    createdAt: now,
    midPrice: Math.round(midPrice * 10000) / 10000,
  };

  activeQuotes.set(quoteId, quote);

  broadcastRFQEvent("amm_quote", {
    quoteId: quote.quoteId,
    marketId: quote.marketId,
    side: quote.side,
    price: quote.price,
    size: quote.filledSize,
  });

  return quote;
}

const PARLAY_SPREAD_BPS = 300;

export function getParlayAMMQuote(
  legs: ParlayLegInput[],
  sizeUsd: number,
  config: AMMConfig = DEFAULT_CONFIG
): ParlayAMMQuote | { error: string } {
  if (legs.length < 2) return { error: "Parlay requires at least 2 legs" };
  if (sizeUsd < config.minQuoteUsd) return { error: `Minimum size is $${config.minQuoteUsd}` };
  if (sizeUsd > config.maxSizeUsd) return { error: `Maximum size is $${config.maxSizeUsd}` };

  let midPrice = 1;
  for (const leg of legs) {
    const market = getMarket(leg.marketId);
    if (!market) return { error: `Market not found: ${leg.marketId.slice(0, 10)}...` };
    if (market.status !== 0) return { error: "All markets must be active" };
    const now = Math.floor(Date.now() / 1000);
    if (market.expiresAt <= now) return { error: "All markets must not be expired" };
    const legPrice = leg.side === "yes" ? market.yesPrice : market.noPrice;
    midPrice *= legPrice;
  }

  const spreadBps = Math.min(PARLAY_SPREAD_BPS, config.maxSpreadBps);
  const halfSpread = spreadBps / 20000;
  const price = Math.min(0.99, Math.max(0.01, midPrice + halfSpread));
  const totalCost = price * sizeUsd;
  const potentialPayout = sizeUsd;

  const quoteId = `parlay-${Date.now()}-${++quoteNonce}`;
  const now = Math.floor(Date.now() / 1000);
  const quote: ParlayAMMQuote = {
    quoteId,
    legs: legs.map((l) => ({ marketId: l.marketId, side: l.side })),
    requestedSize: sizeUsd,
    filledSize: sizeUsd,
    price: Math.round(price * 10000) / 10000,
    totalCost: Math.round(totalCost * 100) / 100,
    potentialPayout: Math.round(potentialPayout * 100) / 100,
    spreadBps,
    midPrice: Math.round(midPrice * 10000) / 10000,
    expiresAt: now + config.quoteTtlSeconds,
    createdAt: now,
  };

  activeParlayQuotes.set(quoteId, quote);
  return quote;
}

export function getQuote(quoteId: string): AMMQuote | null {
  const quote = activeQuotes.get(quoteId);
  if (!quote) return null;
  if (quote.expiresAt < Math.floor(Date.now() / 1000)) {
    activeQuotes.delete(quoteId);
    return null;
  }
  return quote;
}

export function acceptQuote(quoteId: string): AMMQuote | { error: string } {
  const quote = activeQuotes.get(quoteId);
  if (!quote) return { error: "Quote not found or expired" };

  const now = Math.floor(Date.now() / 1000);
  if (quote.expiresAt < now) {
    activeQuotes.delete(quoteId);
    return { error: "Quote expired" };
  }

  activeQuotes.delete(quoteId);

  broadcastRFQEvent("amm_fill", {
    quoteId: quote.quoteId,
    marketId: quote.marketId,
    side: quote.side,
    price: quote.price,
    size: quote.filledSize,
  });

  console.log(
    `[AMM] Fill: ${quote.side.toUpperCase()} ${quote.filledSize} @ ${quote.price} on ${quote.marketId.slice(0, 10)}...`
  );

  return quote;
}

export function getAMMStats() {
  return {
    activeQuotes: activeQuotes.size,
    config: DEFAULT_CONFIG,
  };
}

/**
 * Auto-quote handler: called when an on-chain RFQ event arrives.
 * Generates an AMM quote and logs it (in production, this would
 * respond on-chain via the Unlink adapter).
 */
export function handleIncomingRFQ(
  requestId: string,
  marketId: string,
  isYes: boolean,
  size: string
) {
  const sizeUsd = Number(BigInt(size)) / 1e18;
  const side = isYes ? "yes" : "no";
  const result = getAMMQuote(marketId, side as "yes" | "no", sizeUsd);

  if ("error" in result) {
    console.log(`[AMM] Skipped RFQ ${requestId.slice(0, 10)}: ${result.error}`);
    return;
  }

  console.log(
    `[AMM] Auto-quoted RFQ ${requestId.slice(0, 10)}: ${result.side.toUpperCase()} ${result.filledSize} @ ${result.price} (spread: ${result.spreadBps}bps, ttl: ${DEFAULT_CONFIG.quoteTtlSeconds}s)`
  );
}
