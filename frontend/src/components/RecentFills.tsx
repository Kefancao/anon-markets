"use client";

import { ArrowUpDown, ExternalLink, RefreshCw } from "lucide-react";
import type { FillRecord } from "../types";
import type { Market } from "../types";
import { COLLATERAL_SYMBOL } from "../lib/constants";
import { useOnChainFills } from "../hooks/useOnChainFills";

const EXPLORER_URL = "https://testnet.monadscan.com";

interface RecentFillsProps {
  markets: Market[];
  onSelectMarket?: (marketId: string) => void;
  refreshTrigger?: number;
}

export function RecentFills({ markets, onSelectMarket, refreshTrigger }: RecentFillsProps) {
  const { fills, loading, error, refetch } = useOnChainFills(markets, refreshTrigger);

  return (
    <div className="rounded-xl bg-card border border-border overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <ArrowUpDown className="w-4 h-4 text-accent" />
          <h3 className="text-sm font-semibold">Recent Fills</h3>
        </div>
        <button
          type="button"
          onClick={() => refetch()}
          disabled={loading}
          className="p-1 rounded text-muted hover:text-accent transition-colors disabled:opacity-50"
          title="Refresh from chain"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      <div className="divide-y divide-border max-h-[200px] overflow-y-auto">
        {error ? (
          <div className="px-4 py-6 text-center text-xs text-rose-500">
            {error}
          </div>
        ) : loading && fills.length === 0 ? (
          <div className="px-4 py-6 text-center text-xs text-muted">
            Loading…
          </div>
        ) : fills.length === 0 ? (
          <div className="px-4 py-6 text-center text-xs text-muted">
            No recent fills
          </div>
        ) : (
          fills.map((fill) => (
            <div
              key={fill.id}
              className="flex items-center justify-between gap-2 px-4 py-2.5 text-xs hover:bg-card-hover transition-colors"
            >
              <div className="min-w-0 flex-1 flex items-center gap-2">
                {onSelectMarket ? (
                  <button
                    type="button"
                    onClick={() => onSelectMarket(fill.marketId)}
                    className="text-left font-medium text-foreground hover:text-accent truncate transition-colors"
                  >
                    {fill.question || fill.marketId.slice(0, 10) + "…"}
                  </button>
                ) : (
                  <span className="font-medium text-foreground truncate">
                    {fill.question || fill.marketId.slice(0, 10) + "…"}
                  </span>
                )}
              </div>
              <span className="tabular-nums font-medium shrink-0">
                {fill.amountUsd.toFixed(2)} {COLLATERAL_SYMBOL}
              </span>
              <a
                href={`${EXPLORER_URL}/tx/${fill.txHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0 p-1 rounded text-muted hover:text-accent transition-colors"
                title="View on Monadscan"
              >
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
