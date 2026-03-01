"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Link2, Loader2 } from "lucide-react";
import { useUnlink, useInteract, useUnlinkBalance, parseAmount } from "@unlink-xyz/react";
import { ethers } from "ethers";
import type { Market } from "../types";
import { COLLATERAL_SYMBOL } from "../lib/constants";
import { formatPercent } from "../lib/format";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
const PARLAY_ENGINE = process.env.NEXT_PUBLIC_PARLAY_ENGINE_ADDRESS || "";
const COLLATERAL_TOKEN = process.env.NEXT_PUBLIC_COLLATERAL_TOKEN_ADDRESS || "";
const RPC_URL = process.env.NEXT_PUBLIC_MONAD_RPC_URL || "https://testnet-rpc.monad.xyz";

const PARLAY_REQUESTED_TOPIC = ethers.id("ParlayRequested(bytes32,address,uint256,uint256)");

function toBytes32(marketId: string): string {
  const hex = marketId.startsWith("0x") ? marketId.slice(2) : marketId;
  return "0x" + hex.padStart(64, "0").slice(-64);
}

export interface ParlayLegSelection {
  market: Market;
  isYes: boolean;
}

interface ParlayAMMQuote {
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

interface ParlayPanelProps {
  legs: ParlayLegSelection[];
  onRemoveLeg: (marketId: string) => void;
  onFillRecorded?: () => void;
}

function combinedOdds(legs: ParlayLegSelection[]): number {
  if (legs.length === 0) return 0;
  return legs.reduce(
    (acc, leg) => acc * (leg.isYes ? leg.market.yesPrice : leg.market.noPrice),
    1
  );
}

export function ParlayPanel({ legs, onRemoveLeg, onFillRecorded }: ParlayPanelProps) {
  const { unlink } = useUnlink();
  const { isPending: interactPending } = useInteract();
  const { balance: shieldedBalance, ready: balanceReady } = useUnlinkBalance(COLLATERAL_TOKEN);

  const [size, setSize] = useState("");
  const [quote, setQuote] = useState<ParlayAMMQuote | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [accepting, setAccepting] = useState(false);
  const [acceptError, setAcceptError] = useState<string | null>(null);
  const quoteDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);


  const parlayPrice = combinedOdds(legs);
  const sizeNum = parseFloat(size) || 0;
  const estimatedCost = sizeNum * parlayPrice;

  const fetchQuote = useCallback(async (sizeVal: number) => {
    if (legs.length < 2 || sizeVal <= 0) {
      setQuote(null);
      setQuoteError(null);
      return;
    }
    setQuoteLoading(true);
    setQuoteError(null);
    try {
      const res = await fetch(`${API_BASE}/api/amm/parlay-quote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          legs: legs.map((l) => ({ marketId: l.market.marketId, side: l.isYes ? "yes" : "no" })),
          size: sizeVal,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setQuoteError(data.error || "Failed to get quote");
        setQuote(null);
      } else {
        setQuote(data.quote);
      }
    } catch {
      setQuoteError("Failed to get quote");
      setQuote(null);
    } finally {
      setQuoteLoading(false);
    }
  }, [legs]);

  useEffect(() => {
    if (quoteDebounce.current) clearTimeout(quoteDebounce.current);
    if (legs.length < 2 || !size || sizeNum <= 0) {
      setQuote(null);
      setQuoteError(null);
      return;
    }
    quoteDebounce.current = setTimeout(() => {
      fetchQuote(sizeNum);
    }, 400);
    return () => {
      if (quoteDebounce.current) clearTimeout(quoteDebounce.current);
    };
  }, [legs, size, sizeNum, fetchQuote]);

  async function handleAccept() {
    if (!quote || quoteCountdown <= 0 || !unlink || !PARLAY_ENGINE || !COLLATERAL_TOKEN) return;
    setAccepting(true);
    setAcceptError(null);
    const collateralLower = COLLATERAL_TOKEN.toLowerCase();
    const sizeWei = parseAmount(quote.filledSize.toFixed(2), 18);
    const totalCostWei = parseAmount(quote.totalCost.toFixed(2), 18);
    const maxTotalCostWei = totalCostWei + (totalCostWei / 10n); // 10% buffer
    const durationSec = 60;

    try {
      const { buildCall } = await import("@unlink-xyz/core");

      const requestLegs = quote.legs.map((l) => ({
        marketId: toBytes32(l.marketId),
        isYes: l.side === "yes",
        size: sizeWei,
      }));

      const requestParlayCall = buildCall({
        to: PARLAY_ENGINE,
        abi: "function requestParlay((bytes32 marketId, bool isYes, uint256 size)[] legs, uint256 maxTotalCost, uint256 duration) returns (bytes32)",
        functionName: "requestParlay",
        args: [requestLegs, maxTotalCostWei, durationSec],
      });

      await unlink.sync();
      const requestResult = await unlink.interact(
        {
          spend: [{ token: collateralLower, amount: 1n }],
          calls: [requestParlayCall],
          receive: [{ token: collateralLower, minAmount: 0n }],
        },
        { skipBroadcast: false }
      );

      let txHash: string | null = null;
      for (let i = 0; i < 30; i++) {
        await new Promise((r) => setTimeout(r, 2000));
        try {
          const status = await unlink.getTxStatus(requestResult.relayId);
          if (status.state === "succeeded") {
            txHash = status.txHash ?? null;
            break;
          }
          if (["reverted", "failed", "dead"].includes(status.state)) {
            throw new Error(status.error ?? `Transaction ${status.state}`);
          }
        } catch (e) {
          if (i >= 2) break;
          throw e;
        }
      }

      if (!txHash) {
        throw new Error("Request parlay tx did not confirm in time");
      }

      const provider = new ethers.JsonRpcProvider(RPC_URL);
      const receipt = await provider.getTransactionReceipt(txHash);
      if (!receipt) throw new Error("Receipt not found");
      const log = receipt.logs.find(
        (l) => l.address.toLowerCase() === PARLAY_ENGINE.toLowerCase() && l.topics[0] === PARLAY_REQUESTED_TOPIC
      );
      if (!log || !log.topics[1]) throw new Error("ParlayRequested event not found");
      const parlayId = log.topics[1] as string;

      const legPrices1e18 = quote.legs.map(() =>
        String(BigInt(Math.round((quote.price / quote.legs.length) * 1e18)))
      );
      const submitRes = await fetch(`${API_BASE}/api/amm/parlay-submit-quote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ parlayId, legPrices: legPrices1e18 }),
      });
      const submitData = await submitRes.json();
      if (!submitRes.ok) {
        throw new Error(submitData.error || "Maker quote failed");
      }
      const quoteIdBytes32 = submitData.quoteId as string;

      const approveCall = buildCall({
        to: COLLATERAL_TOKEN,
        abi: "function approve(address spender, uint256 amount) returns (bool)",
        functionName: "approve",
        args: [PARLAY_ENGINE, totalCostWei],
      });
      const fillParlayCall = buildCall({
        to: PARLAY_ENGINE,
        abi: "function fillParlay(bytes32 quoteId)",
        functionName: "fillParlay",
        args: [quoteIdBytes32],
      });

      const spendWei = totalCostWei + 1n;
      const fillResult = await unlink.interact(
        {
          spend: [{ token: collateralLower, amount: spendWei }],
          calls: [approveCall, fillParlayCall],
          receive: [{ token: collateralLower, minAmount: 0n }],
        },
        { skipBroadcast: false }
      );

      let fillTxHash: string | null = null;
      for (let i = 0; i < 30; i++) {
        await new Promise((r) => setTimeout(r, 2000));
        try {
          const status = await unlink.getTxStatus(fillResult.relayId);
          if (status.state === "succeeded") {
            fillTxHash = status.txHash ?? null;
            break;
          }
          if (["reverted", "failed", "dead"].includes(status.state)) {
            throw new Error(status.error ?? `Fill ${status.state}`);
          }
        } catch (e) {
          if (i >= 2) break;
          throw e;
        }
      }

      setQuote(null);
      if (fillTxHash) onFillRecorded?.();
    } catch (e) {
      setAcceptError(e instanceof Error ? e.message : "Accept failed");
    } finally {
      setAccepting(false);
    }
  }

  const quoteCountdown = quote
    ? Math.max(0, quote.expiresAt - Math.floor(Date.now() / 1000))
    : 0;
  const quoteCostWei = quote ? parseAmount(quote.totalCost.toFixed(2), 18) : 0n;
  const hasEnoughBalance = balanceReady && shieldedBalance >= quoteCostWei;
  const canAccept =
    quote &&
    quoteCountdown > 0 &&
    !accepting &&
    !interactPending &&
    hasEnoughBalance &&
    unlink &&
    PARLAY_ENGINE &&
    COLLATERAL_TOKEN;

  return (
    <div className="rounded-xl bg-card border border-border overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
        <Link2 className="w-4 h-4 text-accent" />
        <h3 className="text-sm font-semibold">Parlay</h3>
      </div>
      <div className="p-4 space-y-3">
        {legs.length === 0 ? (
          <p className="text-xs text-muted">
            Select 2+ markets from the list to build a parlay. All legs must win for the parlay to pay out.
          </p>
        ) : (
          <>
            <div className="space-y-2">
              {legs.map((leg, i) => (
                <div key={leg.market.marketId} className="flex items-start gap-2 text-xs">
                  <span className="text-muted shrink-0">{i + 1}.</span>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-foreground line-clamp-2">
                      {leg.market.question}
                    </p>
                    <p className="text-[10px] text-muted mt-0.5">
                      {leg.isYes ? "Yes" : "No"} @ {formatPercent(leg.isYes ? leg.market.yesPrice : leg.market.noPrice)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onRemoveLeg(leg.market.marketId)}
                    className="shrink-0 text-muted hover:text-foreground text-[10px]"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
            {legs.length > 1 && (
              <>
                <div className="flex flex-wrap items-center gap-x-1.5 text-[10px] text-muted">
                  {legs.map((_, i) => (
                    <span key={i} className="flex items-center gap-1.5">
                      {i > 0 && <span className="font-semibold text-accent">And</span>}
                      <span>Leg {i + 1}</span>
                    </span>
                  ))}
                </div>
                <div className="pt-2 border-t border-border space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted">Combined odds (AMM)</span>
                    <span className="font-semibold">{formatPercent(parlayPrice)}</span>
                  </div>

                  {/* Trade form */}
                  <div className="space-y-2 pt-2">
                    <label className="text-xs text-muted block">
                      Size ({COLLATERAL_SYMBOL})
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={size}
                      onChange={(e) => setSize(e.target.value)}
                      placeholder="0.00"
                      className="w-full px-3 py-2 rounded-lg bg-background border border-border focus:border-accent focus:outline-none text-sm placeholder:text-muted/50"
                    />
                    {sizeNum > 0 && !quote && !quoteLoading && (
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted">Est. cost</span>
                        <span className="font-semibold">
                          {estimatedCost.toFixed(2)} {COLLATERAL_SYMBOL}
                        </span>
                      </div>
                    )}

                    {quoteLoading && sizeNum > 0 && (
                      <div className="p-2.5 rounded-lg border border-border bg-muted/30 flex items-center justify-center gap-2 text-xs text-muted">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        Fetching quote…
                      </div>
                    )}

                    {quote && (
                      <div className="p-2.5 rounded-lg border border-accent/30 bg-accent-muted/50 space-y-1.5 text-xs">
                        <div className="flex items-center justify-between">
                          <span className="text-muted">Price</span>
                          <span className="font-semibold">{quote.price.toFixed(4)}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-muted">Cost</span>
                          <span className="font-semibold">{quote.totalCost.toFixed(2)} {COLLATERAL_SYMBOL}</span>
                        </div>
                        <div className="flex items-center justify-between text-green-600 dark:text-green-400">
                          <span className="text-muted">Payout</span>
                          <span className="font-semibold">{quote.potentialPayout.toFixed(2)} {COLLATERAL_SYMBOL}</span>
                        </div>
                        <div className="flex items-center justify-between text-[10px] text-muted">
                          <span>Spread {quote.spreadBps}bps</span>
                          <span>{quoteCountdown > 0 ? `${quoteCountdown}s` : "Expired"}</span>
                        </div>
                      </div>
                    )}

                    {quoteError && (
                      <p className="text-xs text-rose-500">{quoteError}</p>
                    )}
                    {acceptError && (
                      <p className="text-xs text-rose-500">{acceptError}</p>
                    )}

                    <button
                      type="button"
                      disabled={!canAccept}
                      onClick={handleAccept}
                      className="w-full py-2.5 rounded-lg bg-accent hover:bg-accent-hover disabled:opacity-50 disabled:pointer-events-none text-white text-sm font-medium transition-colors flex items-center justify-center gap-2"
                    >
                      {accepting ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          Accepting…
                        </>
                      ) : (
                        "Accept"
                      )}
                    </button>
                  </div>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
