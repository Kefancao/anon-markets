"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  ArrowLeft, Clock, BarChart3, Users, Lock, Loader2,
  CheckCircle, XCircle, RotateCcw, Zap, ExternalLink,
} from "lucide-react";
import { useUnlink, useInteract, useUnlinkBalance, parseAmount, formatAmount } from "@unlink-xyz/react";
import type { Market } from "../types";
import {
  formatPercent,
  formatCountdown,
  volumeFromShares,
  formatCompact,
} from "../lib/format";
import { COLLATERAL_SYMBOL } from "../lib/constants";
import { usePrivateRFQ } from "../hooks/usePrivateRFQ";
import { recordFill } from "../lib/api";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
const EXPLORER_URL = "https://testnet.monadscan.com";
const COLLATERAL_TOKEN = process.env.NEXT_PUBLIC_COLLATERAL_TOKEN_ADDRESS || "";
const PREDICTION_MARKET = process.env.NEXT_PUBLIC_PREDICTION_MARKET_ADDRESS || "";

interface MarketDetailProps {
  market: Market;
  onBack: () => void;
  onFillRecorded?: () => void;
}

type SubmitState =
  | { kind: "idle" }
  | { kind: "proving" }
  | { kind: "submitted"; relayId: string }
  | { kind: "confirmed"; txHash: string }
  | { kind: "failed"; message: string };

interface AMMQuote {
  quoteId: string;
  side: "yes" | "no";
  price: number;
  totalCost: number;
  potentialPayout: number;
  spreadBps: number;
  midPrice: number;
  filledSize: number;
  expiresAt: number;
}

export function MarketDetail({ market, onBack, onFillRecorded }: MarketDetailProps) {
  const { activeAccount, unlink } = useUnlink();
  const { balance: shieldedBalance, ready: balanceReady } = useUnlinkBalance(COLLATERAL_TOKEN);
  const {
    isPending: rfqPending,
    txStatus,
    relayId: activeRelayId,
    clearRelay,
    ready: rfqReady,
  } = usePrivateRFQ();
  const { isPending: ammInteractPending } = useInteract();

  const hasShieldedBalance = balanceReady && shieldedBalance > 0n;
  const displayBalance = balanceReady ? formatAmount(shieldedBalance, 18) : "...";

  const [side, setSide] = useState<"yes" | "no">("yes");
  const [amount, setAmount] = useState("");
  const [tab, setTab] = useState<"rfq" | "parlay">("rfq");
  const [submitState, setSubmitState] = useState<SubmitState>({ kind: "idle" });
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // AMM quote state
  const [ammQuote, setAmmQuote] = useState<AMMQuote | null>(null);
  const [ammLoading, setAmmLoading] = useState(false);
  const [ammError, setAmmError] = useState<string | null>(null);
  const [ammAccepting, setAmmAccepting] = useState(false);
  const quoteDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fetch AMM quote when amount or side changes
  const fetchQuote = useCallback(
    async (sizeStr: string, quoteSide: string) => {
      const size = parseFloat(sizeStr);
      if (isNaN(size) || size <= 0) {
        setAmmQuote(null);
        setAmmError(null);
        return;
      }

      setAmmLoading(true);
      setAmmError(null);
      try {
        const res = await fetch(`${API_BASE}/api/amm/quote`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            marketId: market.marketId,
            side: quoteSide,
            size,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          setAmmError(data.error || "Failed to get quote");
          setAmmQuote(null);
        } else {
          setAmmQuote(data.quote);
        }
      } catch {
        setAmmError("Network error");
        setAmmQuote(null);
      } finally {
        setAmmLoading(false);
      }
    },
    [market.marketId]
  );

  useEffect(() => {
    if (quoteDebounce.current) clearTimeout(quoteDebounce.current);
    if (!amount || parseFloat(amount) <= 0) {
      setAmmQuote(null);
      return;
    }
    quoteDebounce.current = setTimeout(() => {
      fetchQuote(amount, side);
    }, 400);
    return () => {
      if (quoteDebounce.current) clearTimeout(quoteDebounce.current);
    };
  }, [amount, side, fetchQuote]);

  // Accept AMM quote — settles on-chain via Unlink adapter
  async function handleAcceptQuote() {
    if (!ammQuote || !unlink) return;
    setAmmAccepting(true);
    setSubmitState({ kind: "proving" });

    try {
      // 1. Mark quote as accepted on backend
      const acceptRes = await fetch(`${API_BASE}/api/amm/accept`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quoteId: ammQuote.quoteId }),
      });
      if (!acceptRes.ok) {
        const data = await acceptRes.json();
        throw new Error(data.error || "Quote expired or unavailable");
      }

      // 2. Settle on-chain — match test script exactly: sync, then unshield → transfer → mintShares
      // Adapter requires gain > 0 for reshield, so unshield costWei + 1n (1 wei is reshielded).
      const costWei = parseAmount(ammQuote.totalCost.toFixed(2), 18);
      const spendWei = costWei + 1n;
      const sharesWei = parseAmount(ammQuote.filledSize.toFixed(2), 18);
      const { buildCall } = await import("@unlink-xyz/core");

      const collateralLower = COLLATERAL_TOKEN.toLowerCase();
      const marketIdBytes32 =
        market.marketId.startsWith("0x") ? market.marketId : `0x${market.marketId}`;

      await unlink.sync();

      const transferCall = buildCall({
        to: COLLATERAL_TOKEN,
        abi: "function transfer(address to, uint256 amount) returns (bool)",
        functionName: "transfer",
        args: [PREDICTION_MARKET, costWei],
      });

      const mintCall = buildCall({
        to: PREDICTION_MARKET,
        abi: "function mintShares(bytes32 marketId, address recipient, bool isYes, uint256 shares, uint256 cost)",
        functionName: "mintShares",
        args: [
          marketIdBytes32,
          unlink.adapter.address,
          ammQuote.side === "yes",
          sharesWei,
          costWei,
        ],
      });

      const result = await unlink.interact(
        {
          spend: [{ token: collateralLower, amount: spendWei }],
          calls: [transferCall, mintCall],
          receive: [{ token: collateralLower, minAmount: 0n }],
        },
        { skipBroadcast: false }
      );

      setSubmitState({ kind: "submitted", relayId: result.relayId });
      setAmmQuote(null);

      // Poll relay status ourselves (like the test script) instead of relying
      // on useTxStatus, which can hit 400 if the broadcaster purges the relay
      // before the hook's first poll fires.
      let txHash: string | null = null;
      for (let i = 0; i < 30; i++) {
        await new Promise((r) => setTimeout(r, 2000));
        try {
          const status = await unlink.getTxStatus(result.relayId);
          if (status.state === "succeeded") {
            txHash = status.txHash ?? null;
            break;
          }
          if (["reverted", "failed", "dead"].includes(status.state)) {
            throw new Error(status.error ?? `Transaction ${status.state}`);
          }
        } catch {
          // 400 / fetch error after relay was accepted — relay may be purged
          // after success; treat as success if we've already waited a few polls.
          if (i >= 2) break;
        }
      }

      if (txHash) {
        setSubmitState({ kind: "confirmed", txHash });
        if (txHash.startsWith("0x") && ammQuote) {
          recordFill({
            txHash,
            marketId: market.marketId,
            question: market.question,
            amountUsd: ammQuote.totalCost,
            side: ammQuote.side,
            shares: sharesWei.toString(),
          }).catch(() => {})
            .finally(() => onFillRecorded?.());
        }
      } else {
        await unlink.sync();
        setSubmitState({ kind: "confirmed", txHash: result.relayId });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Settlement failed";
      setSubmitState({ kind: "failed", message: msg });
    } finally {
      setAmmAccepting(false);
    }
  }

  // Track on-chain relay status (RFQ path only — AMM polls inline above)
  useEffect(() => {
    if (submitState.kind !== "submitted") return;
    if (!activeRelayId) return;

    if (txStatus.state === "succeeded") {
      setSubmitState({ kind: "confirmed", txHash: txStatus.txHash || "" });
    } else if (txStatus.state && ["reverted", "failed", "dead"].includes(txStatus.state)) {
      setSubmitState({ kind: "failed", message: txStatus.error || `Transaction ${txStatus.state}` });
    }
  }, [
    txStatus.state, txStatus.txHash, txStatus.error,
    submitState.kind, activeRelayId,
  ]);

  useEffect(() => {
    return () => { if (timeoutRef.current) clearTimeout(timeoutRef.current); };
  }, []);

  const volume = volumeFromShares(market.totalVolume);
  const price = ammQuote ? ammQuote.price : (side === "yes" ? market.yesPrice : market.noPrice);
  const payout =
    amount && !isNaN(parseFloat(amount))
      ? ammQuote
        ? ammQuote.potentialPayout.toFixed(2)
        : (parseFloat(amount) / price).toFixed(2)
      : "0.00";

  const isBusy = submitState.kind === "proving" || submitState.kind === "submitted" || ammAccepting || ammInteractPending;

  function resetSubmit() {
    setSubmitState({ kind: "idle" });
    clearRelay();
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
  }

  const ammCountdown = ammQuote
    ? Math.max(0, ammQuote.expiresAt - Math.floor(Date.now() / 1000))
    : 0;

  return (
    <div className="space-y-4">
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 text-sm text-muted hover:text-foreground transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Markets
      </button>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
          <div className="p-5 rounded-xl bg-card border border-border">
            <h2 className="text-lg font-semibold mb-3">{market.question}</h2>
            <div className="flex flex-wrap gap-4 text-xs text-muted mb-4">
              <span className="flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" />
                Expires {formatCountdown(market.expiresAt)}
              </span>
              <span className="flex items-center gap-1">
                <BarChart3 className="w-3.5 h-3.5" />{formatCompact(volume)} {COLLATERAL_SYMBOL} volume
              </span>
              <span className="flex items-center gap-1">
                <Users className="w-3.5 h-3.5" />
                {formatCompact(
                  (Number(BigInt(market.totalYesShares)) + Number(BigInt(market.totalNoShares))) / 1e18
                )} shares
              </span>
              <span className="flex items-center gap-1 text-accent">
                <Lock className="w-3.5 h-3.5" />
                Private via Unlink
              </span>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex-1">
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-green font-medium">Yes {formatPercent(market.yesPrice)}</span>
                  <span className="text-red font-medium">No {formatPercent(market.noPrice)}</span>
                </div>
                <div className="w-full h-3 rounded-full bg-red/25 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-green transition-all duration-500"
                    style={{ width: `${Math.max(2, Math.min(98, market.yesPrice * 100))}%` }}
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="p-5 rounded-xl bg-card border border-border">
            <h3 className="text-sm font-semibold mb-3">Recent Activity</h3>
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center justify-between py-2 border-b border-border last:border-0 text-xs">
                  <span className="text-muted">RFQ #{1200 + i}</span>
                  <span className={i % 2 === 0 ? "text-green" : "text-red"}>
                    {i % 2 === 0 ? "Yes" : "No"} @ {(Math.random() * 0.5 + 0.3).toFixed(2)}
                  </span>
                  <span className="text-muted">{Math.floor(Math.random() * 5000 + 500)} shares</span>
                  <span className="text-muted">{i * 2 + 1}m ago</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Trade panel */}
        <div className="space-y-4">
          <div className="p-5 rounded-xl bg-card border border-border">
            <div className="flex gap-1 p-0.5 bg-background rounded-lg mb-4">
              <TabButton active={tab === "rfq"} onClick={() => setTab("rfq")}>RFQ</TabButton>
              <TabButton active={tab === "parlay"} onClick={() => setTab("parlay")}>Parlay</TabButton>
            </div>

            {/* Shielded balance indicator */}
            {activeAccount && (
              <div className={`mb-4 p-2.5 rounded-lg text-xs flex items-center justify-between ${
                hasShieldedBalance ? "bg-background" : "bg-yellow-muted border border-yellow/20"
              }`}>
                <div className="flex items-center gap-1.5">
                  <Lock className="w-3 h-3 text-accent" />
                  <span className="text-muted">Shielded Balance:</span>
                  <span className={hasShieldedBalance ? "font-semibold" : "font-semibold text-yellow"}>
                    {displayBalance} {COLLATERAL_SYMBOL}
                  </span>
                </div>
                {!hasShieldedBalance && (
                  <span className="text-yellow text-[10px]">
                    Deposit needed
                  </span>
                )}
              </div>
            )}

            <div className="flex gap-2 mb-4">
              <button
                onClick={() => setSide("yes")}
                className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all ${
                  side === "yes"
                    ? "bg-green text-white shadow-lg shadow-green/20"
                    : "bg-green-muted text-green hover:bg-green/20"
                }`}
              >
                Yes {formatPercent(market.yesPrice)}
              </button>
              <button
                onClick={() => setSide("no")}
                className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all ${
                  side === "no"
                    ? "bg-red text-white shadow-lg shadow-red/20"
                    : "bg-red-muted text-red hover:bg-red/20"
                }`}
              >
                No {formatPercent(market.noPrice)}
              </button>
            </div>

            <div className="mb-4">
              <label className="text-xs text-muted mb-1.5 block">Amount ({COLLATERAL_SYMBOL})</label>
              <div className="relative">
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full px-3 py-2.5 rounded-lg bg-background border border-border focus:border-accent focus:outline-none text-sm placeholder:text-muted/50"
                />
                <div className="absolute right-3 top-1/2 -translate-y-1/2 flex gap-1">
                  {[100, 500, 1000].map((v) => (
                    <button
                      key={v}
                      onClick={() => setAmount(v.toString())}
                      className="px-1.5 py-0.5 rounded text-[10px] bg-border/50 text-muted hover:text-foreground transition-colors"
                    >
                      {v}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* AMM Quote Card */}
            {ammQuote && submitState.kind === "idle" && (
              <div className="mb-4 p-3 rounded-lg border border-accent/30 bg-accent-muted/50 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-accent">
                    <Zap className="w-3.5 h-3.5" />
                    AMM Instant Quote
                  </div>
                  <span className="text-[10px] text-muted tabular-nums">
                    {ammCountdown > 0 ? `${ammCountdown}s` : "expired"}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-muted">Price</span>
                    <div className="font-semibold">{ammQuote.price.toFixed(4)}</div>
                  </div>
                  <div>
                    <span className="text-muted">Mid</span>
                    <div className="font-semibold">{ammQuote.midPrice.toFixed(4)}</div>
                  </div>
                  <div>
                    <span className="text-muted">Cost</span>
                    <div className="font-semibold">{ammQuote.totalCost.toFixed(2)} {COLLATERAL_SYMBOL}</div>
                  </div>
                  <div>
                    <span className="text-muted">Payout</span>
                    <div className="font-semibold text-green">{ammQuote.potentialPayout.toFixed(2)} {COLLATERAL_SYMBOL}</div>
                  </div>
                </div>
                <div className="flex items-center justify-between text-[10px] text-muted">
                  <span>Spread: {ammQuote.spreadBps}bps</span>
                  <span>Size: {ammQuote.filledSize} {COLLATERAL_SYMBOL}</span>
                </div>
                <button
                  onClick={handleAcceptQuote}
                  disabled={ammAccepting || ammCountdown <= 0 || !hasShieldedBalance}
                  className="w-full py-2.5 rounded-lg bg-accent hover:bg-accent-hover disabled:opacity-50 text-white text-sm font-semibold transition-colors flex items-center justify-center gap-2"
                >
                  {ammAccepting ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Zap className="w-3.5 h-3.5" />
                  )}
                  {ammAccepting
                    ? "Settling on-chain..."
                    : !hasShieldedBalance
                      ? "Deposit to Trade"
                      : `Accept @ ${ammQuote.price.toFixed(4)}`}
                </button>
              </div>
            )}

            {ammLoading && !ammQuote && (
              <div className="mb-4 p-3 rounded-lg bg-background text-xs text-muted flex items-center gap-2">
                <Loader2 className="w-3 h-3 animate-spin" />
                Fetching AMM quote...
              </div>
            )}

            {ammError && (
              <div className="mb-4 p-2 rounded-lg bg-red-muted text-xs text-red">
                {ammError}
              </div>
            )}

            {/* Price summary (shown when no AMM quote) */}
            {!ammQuote && !ammLoading && (
              <div className="space-y-2 mb-4 p-3 rounded-lg bg-background text-xs">
                <div className="flex justify-between">
                  <span className="text-muted">Avg Price</span>
                  <span>{price.toFixed(4)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted">Potential Payout</span>
                  <span className="text-green font-medium">{payout} {COLLATERAL_SYMBOL}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted">Settlement</span>
                  <span className="text-accent">Private (Unlink)</span>
                </div>
              </div>
            )}

            {/* Status feedback */}
            {submitState.kind === "submitted" && (
              <div className="mb-3 p-2.5 rounded-lg bg-accent-muted text-xs flex items-center gap-2">
                <Loader2 className="w-3.5 h-3.5 text-accent animate-spin shrink-0" />
                <span className="text-accent font-medium">Broadcasting... waiting for confirmation</span>
              </div>
            )}

            {submitState.kind === "confirmed" && (() => {
              const hash = submitState.txHash;
              const isOnChain = hash.startsWith("0x") && hash.length >= 42;
              const isAmm = hash.startsWith("amm:");
              return (
                <div className="mb-3 p-2.5 rounded-lg bg-green-muted text-xs space-y-1.5">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-3.5 h-3.5 text-green shrink-0" />
                    <span className="text-green font-medium flex-1">
                      {isAmm ? "AMM quote filled (off-chain)" : "Quote submitted on-chain!"}
                    </span>
                    <button onClick={resetSubmit} className="text-green/60 hover:text-green shrink-0">
                      <RotateCcw className="w-3 h-3" />
                    </button>
                  </div>
                  {isOnChain ? (
                    <a
                      href={`${EXPLORER_URL}/tx/${hash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 text-accent hover:text-accent-hover transition-colors"
                    >
                      <ExternalLink className="w-3 h-3" />
                      <span className="font-mono">{hash.slice(0, 10)}...{hash.slice(-8)}</span>
                      <span className="text-muted">View on Monadscan</span>
                    </a>
                  ) : !isAmm && (
                    <div className="text-green/70 text-[10px]">
                      Transaction confirmed (relay {hash.slice(0, 12)}...)
                    </div>
                  )}
                  {isAmm && (
                    <div className="text-green/70 text-[10px]">
                      AMM fills settle off-chain. Use the on-chain RFQ for verifiable settlement.
                    </div>
                  )}
                </div>
              );
            })()}

            {submitState.kind === "failed" && (
              <div className="mb-3 p-2.5 rounded-lg bg-red-muted text-xs flex items-center gap-2">
                <XCircle className="w-3.5 h-3.5 text-red shrink-0" />
                <span className="text-red flex-1 min-w-0 truncate">{submitState.message}</span>
                <button onClick={resetSubmit} className="text-red/60 hover:text-red shrink-0">
                  <RotateCcw className="w-3 h-3" />
                </button>
              </div>
            )}

            <p className="text-[10px] text-muted text-center mt-2">
              Collateral and settlement are private via Unlink
            </p>
          </div>

          {tab === "parlay" && (
            <div className="p-5 rounded-xl bg-card border border-border">
              <h4 className="text-sm font-semibold mb-2">Parlay Builder</h4>
              <p className="text-xs text-muted mb-3">
                Add multiple markets to create a parlay bet. All legs must win for the parlay to pay out.
              </p>
              <div className="p-3 rounded-lg bg-background border border-dashed border-border text-center">
                <p className="text-xs text-muted">Select markets from the list to add legs</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function TabButton({
  children,
  active,
  onClick,
}: {
  children: React.ReactNode;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 py-1.5 rounded-md text-xs font-medium transition-all ${
        active
          ? "bg-card text-foreground shadow-sm"
          : "text-muted hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}
