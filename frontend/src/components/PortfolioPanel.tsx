"use client";

import { useState, useEffect, useCallback } from "react";
import { Lock, BarChart3, RefreshCw, Link2, Loader2, Banknote } from "lucide-react";
import { ethers } from "ethers";
import { useUnlink, useUnlinkBalance, useInteract, formatAmount } from "@unlink-xyz/react";
import type { Market, Position, ParlayPositionDisplay } from "../types";
import { COLLATERAL_SYMBOL } from "../lib/constants";
import { MarketStatus } from "../types";

const COLLATERAL_TOKEN = process.env.NEXT_PUBLIC_COLLATERAL_TOKEN_ADDRESS || "";
const PREDICTION_MARKET = process.env.NEXT_PUBLIC_PREDICTION_MARKET_ADDRESS || "";
const RPC_URL = process.env.NEXT_PUBLIC_MONAD_RPC_URL || "https://testnet-rpc.monad.xyz";
const EXPLORER_API_URL = process.env.NEXT_PUBLIC_EXPLORER_API_URL || "https://api.etherscan.io/v2/api";
const EXPLORER_API_KEY = process.env.NEXT_PUBLIC_EXPLORER_API_KEY || "";
const CHAIN_ID = process.env.NEXT_PUBLIC_MONAD_CHAIN_ID || "10143";
const FIRST_BLOCK = 15914463;

const PARLAY_MINTED_TOPIC = ethers.id("ParlaySharesMinted(bytes32,address,uint256,uint256)");

const PM_ABI = [
  "function getShares(bytes32 marketId, address user) view returns (uint256 yes, uint256 no)",
  "function getMarket(bytes32 marketId) view returns (tuple(bytes32 marketId, string question, uint256 createdAt, uint256 expiresAt, uint8 status, uint8 outcome, address oracle, uint256 totalYesShares, uint256 totalNoShares, uint256 totalVolume))",
  "function parlayPositions(bytes32) view returns (address holder, uint256 totalCost, uint256 legCount, bool redeemed)",
  "function getParlayMarketIds(bytes32 parlayPositionId) view returns (bytes32[])",
  "function getParlayShareAmounts(bytes32 parlayPositionId) view returns (uint256[])",
];

function formatShares(wei: string): string {
  const n = Number(BigInt(wei) / BigInt(1e14)) / 1e4;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(2)}K`;
  return n.toFixed(2);
}

async function fetchParlayMintedLogs(recipientAddress: string): Promise<string[]> {
  if (!EXPLORER_API_KEY || !PREDICTION_MARKET) return [];
  const topic2 = "0x" + recipientAddress.toLowerCase().replace(/^0x/, "").padStart(64, "0");
  const params = new URLSearchParams({
    chainid: CHAIN_ID,
    module: "logs",
    action: "getLogs",
    address: PREDICTION_MARKET,
    topic0: PARLAY_MINTED_TOPIC,
    topic2,
    fromBlock: String(FIRST_BLOCK),
    toBlock: "latest",
    page: "1",
    offset: "100",
    apikey: EXPLORER_API_KEY,
  });
  const res = await fetch(`${EXPLORER_API_URL}?${params.toString()}`);
  if (!res.ok) return [];
  const data = (await res.json()) as { result?: unknown };
  if (!Array.isArray(data.result)) return [];
  const logs = data.result as { topics?: string[] }[];
  return logs.map((l) => (l.topics?.[1] ?? "")).filter(Boolean);
}

interface Props {
  markets: Market[];
  onSelectMarket?: (marketId: string) => void;
}

export function PortfolioPanel({ markets, onSelectMarket }: Props) {
  const { activeAccount, unlink } = useUnlink();
  const { balance: shieldedBalance, ready: balanceReady } =
    useUnlinkBalance(COLLATERAL_TOKEN);
  const { isPending: interactPending } = useInteract();
  const [positions, setPositions] = useState<Position[]>([]);
  const [parlayPositions, setParlayPositions] = useState<ParlayPositionDisplay[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [redeemingMarketId, setRedeemingMarketId] = useState<string | null>(null);
  const [redeemError, setRedeemError] = useState<string | null>(null);

  const hasAccount = !!activeAccount;
  const displayBalance = balanceReady
    ? formatAmount(shieldedBalance, 18)
    : "—";

  const adapterAddress = unlink?.adapter?.address as string | undefined;

  const loadPositions = useCallback(async () => {
    if (!adapterAddress || !PREDICTION_MARKET || markets.length === 0) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const provider = new ethers.JsonRpcProvider(RPC_URL);
      const pm = new ethers.Contract(PREDICTION_MARKET, PM_ABI, provider);
      const results: Position[] = [];

      const promises = markets.map(async (m) => {
        try {
          const marketIdBytes32 = m.marketId.startsWith("0x")
            ? m.marketId
            : `0x${m.marketId}`;
          const [yes, no] = await pm.getShares(marketIdBytes32, adapterAddress);
          const yBig = BigInt(yes);
          const nBig = BigInt(no);
          if (yBig > 0n || nBig > 0n) {
            const mkt = (await pm.getMarket(marketIdBytes32)) as unknown[];
            const status = mkt[4] !== undefined ? Number(mkt[4]) : (m.status as number);
            const outcome = mkt[5] !== undefined ? Number(mkt[5]) : (m.outcome as number);
            return {
              marketId: m.marketId,
              question: m.question,
              yesShares: yBig.toString(),
              noShares: nBig.toString(),
              status,
              outcome,
            };
          }
        } catch {
          // skip individual market errors
        }
        return null;
      });

      const settled = await Promise.all(promises);
      for (const r of settled) {
        if (r) results.push(r);
      }
      setPositions(results);

      // Load parlay positions (from mintParlayShares)
      const marketMap = new Map<string, string>();
      for (const m of markets) {
        const id = m.marketId.startsWith("0x") ? m.marketId.toLowerCase() : `0x${m.marketId}`.toLowerCase();
        marketMap.set(id, m.question);
      }
      const parlayIds = await fetchParlayMintedLogs(adapterAddress);
      const parlayList: ParlayPositionDisplay[] = [];
      const adapterLower = adapterAddress.toLowerCase();
      for (const id of parlayIds) {
        try {
          const [holder, totalCost, legCount, redeemed] = await pm.parlayPositions(id);
          if (redeemed) continue;
          if (holder.toLowerCase() !== adapterLower) continue;
          const marketIds = await pm.getParlayMarketIds(id);
          const shareAmounts = await pm.getParlayShareAmounts(id);
          const legs: { marketId: string; question: string; shares: string }[] = [];
          for (let i = 0; i < marketIds.length; i++) {
            const mid = (marketIds[i] as string).toLowerCase();
            legs.push({
              marketId: mid,
              question: marketMap.get(mid) ?? "Unknown market",
              shares: (shareAmounts[i] as bigint).toString(),
            });
          }
          parlayList.push({
            parlayPositionId: id,
            totalCost: totalCost.toString(),
            legCount: legs.length,
            legs,
          });
        } catch {
          // skip invalid or stale parlay id
        }
      }
      setParlayPositions(parlayList);
    } catch (e) {
      console.error("[Portfolio] Failed to load positions:", e);
      setError("Failed to load positions");
      setPositions([]);
      setParlayPositions([]);
    } finally {
      setLoading(false);
    }
  }, [adapterAddress, markets]);

  useEffect(() => {
    if (adapterAddress) {
      loadPositions();
    }
  }, [adapterAddress, loadPositions]);

  const handleRedeem = useCallback(
    async (marketId: string) => {
      if (!unlink?.adapter?.address || !PREDICTION_MARKET || !COLLATERAL_TOKEN) return;
      setRedeemingMarketId(marketId);
      setRedeemError(null);
      const marketIdBytes32 = marketId.startsWith("0x") ? marketId : `0x${marketId}`;
      try {
        const { buildCall } = await import("@unlink-xyz/core");
        const redeemCall = buildCall({
          to: PREDICTION_MARKET,
          abi: "function redeemShares(bytes32 marketId)",
          functionName: "redeemShares",
          args: [marketIdBytes32],
        });
        const collateralLower = COLLATERAL_TOKEN.toLowerCase();
        await unlink.sync();
        await unlink.interact(
          {
            spend: [{ token: collateralLower, amount: 1n }],
            calls: [redeemCall],
            receive: [{ token: collateralLower, minAmount: 0n }],
          },
          { skipBroadcast: false }
        );
        await loadPositions();
      } catch (e) {
        setRedeemError(e instanceof Error ? e.message : "Redeem failed");
      } finally {
        setRedeemingMarketId(null);
      }
    },
    [unlink, loadPositions]
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Portfolio</h1>
        <p className="text-sm text-muted mt-0.5">
          Your balances and positions
        </p>
      </div>

      {!hasAccount ? (
        <div className="p-6 rounded-xl bg-card border border-border text-center text-muted text-sm">
          Connect your wallet to view your portfolio.
        </div>
      ) : (
        <div className="space-y-4">
          <div className="p-5 rounded-xl bg-card border border-border">
            <div className="flex items-center gap-2 mb-3">
              <Lock className="w-4 h-4 text-accent" />
              <h2 className="text-sm font-semibold">Shielded Balance</h2>
            </div>
            <p className="text-2xl font-semibold tabular-nums">
              {displayBalance} {COLLATERAL_SYMBOL}
            </p>
            <p className="text-xs text-muted mt-1">
              Private collateral in Unlink
            </p>
          </div>

          <div className="p-5 rounded-xl bg-card border border-border">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-accent" />
                <h2 className="text-sm font-semibold">Current Positions</h2>
              </div>
              {adapterAddress && (
                <button
                  type="button"
                  onClick={loadPositions}
                  disabled={loading}
                  className="text-muted hover:text-foreground transition-colors"
                  title="Refresh positions"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
                </button>
              )}
            </div>

            {!adapterAddress ? (
              <p className="text-sm text-muted">
                Waiting for Unlink adapter…
              </p>
            ) : loading && positions.length === 0 ? (
              <p className="text-sm text-muted">Loading positions…</p>
            ) : error ? (
              <p className="text-sm text-rose-500">{error}</p>
            ) : positions.length === 0 ? (
              <p className="text-sm text-muted">
                No open positions. Trade in a market to see positions here.
              </p>
            ) : (
              <>
                {redeemError && (
                  <p className="text-sm text-rose-500 mb-2">{redeemError}</p>
                )}
                <ul className="space-y-2">
                  {positions.map((pos) => {
                    const yes = BigInt(pos.yesShares);
                    const no = BigInt(pos.noShares);
                    const total = yes + no;
                    const isResolved = pos.status === MarketStatus.Resolved;
                    const isRedeeming = redeemingMarketId === pos.marketId || interactPending;
                    const hasWinningShares =
                      isResolved &&
                      ((pos.outcome === 1 && yes > 0n) || (pos.outcome === 2 && no > 0n));
                    return (
                      <li key={pos.marketId}>
                        <div className="p-3 rounded-lg bg-background border border-border hover:border-accent/50 transition-colors">
                          <button
                            type="button"
                            onClick={() => onSelectMarket?.(pos.marketId)}
                            className="w-full text-left"
                          >
                            <p className="text-sm font-medium text-foreground line-clamp-2">
                              {pos.question}
                            </p>
                            <div className="mt-2 flex items-center gap-3 text-xs text-muted">
                              {yes > 0n && (
                                <span className="text-emerald-600 dark:text-emerald-400">
                                  Yes: {formatShares(pos.yesShares)}
                                </span>
                              )}
                              {no > 0n && (
                                <span className="text-rose-600 dark:text-rose-400">
                                  No: {formatShares(pos.noShares)}
                                </span>
                              )}
                              <span>
                                Total: {formatShares(total.toString())} shares
                              </span>
                              {isResolved && (
                                <span className="text-amber-600 dark:text-amber-400">
                                  · Resolved
                                </span>
                              )}
                            </div>
                          </button>
                          {hasWinningShares && (
                            <div className="mt-2 pt-2 border-t border-border">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleRedeem(pos.marketId);
                                }}
                                disabled={isRedeeming}
                                className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md bg-emerald-600 text-white hover:bg-emerald-500 disabled:opacity-50 disabled:pointer-events-none"
                              >
                                {isRedeeming ? (
                                  <>
                                    <Loader2 className="w-3 h-3 animate-spin" />
                                    Redeeming…
                                  </>
                                ) : (
                                  <>
                                    <Banknote className="w-3 h-3" />
                                    Redeem
                                  </>
                                )}
                              </button>
                            </div>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}

            {parlayPositions.length > 0 && (
              <div className="mt-4 pt-4 border-t border-border">
                <div className="flex items-center gap-2 mb-2">
                  <Link2 className="w-4 h-4 text-accent" />
                  <h3 className="text-sm font-semibold">Parlay positions</h3>
                </div>
                <ul className="space-y-3">
                  {parlayPositions.map((parlay) => (
                    <li
                      key={parlay.parlayPositionId}
                      className="p-3 rounded-lg bg-background border border-border"
                    >
                      <p className="text-xs text-muted mb-2">
                        Total cost: {formatShares(parlay.totalCost)} {COLLATERAL_SYMBOL} · {parlay.legCount} legs
                      </p>
                      <ul className="space-y-1.5">
                        {parlay.legs.map((leg, idx) => (
                          <li key={`${parlay.parlayPositionId}-${idx}`}>
                            <button
                              type="button"
                              onClick={() => onSelectMarket?.(leg.marketId)}
                              className="w-full text-left text-sm text-foreground hover:text-accent line-clamp-2"
                            >
                              <span className="text-muted font-medium mr-1">{idx + 1}.</span>
                              {leg.question}
                            </button>
                            <p className="text-xs text-muted ml-4">
                              Yes: {formatShares(leg.shares)} shares
                            </p>
                          </li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
