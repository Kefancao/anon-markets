"use client";

import { Check } from "lucide-react";
import type { Market } from "../types";
import { COLLATERAL_SYMBOL } from "../lib/constants";
import {
  formatPercent,
  formatCountdown,
  volumeFromShares,
  formatCompact,
} from "../lib/format";

interface MarketCardProps {
  market: Market;
  onSelect: (market: Market) => void;
  parlayMode?: boolean;
  parlaySelected?: boolean;
  onParlayToggle?: (market: Market) => void;
}

export function MarketCard({
  market,
  onSelect,
  parlayMode = false,
  parlaySelected = false,
  onParlayToggle,
}: MarketCardProps) {
  const volume = volumeFromShares(market.totalVolume);

  const content = (
    <>
      <div className="flex items-start justify-between gap-3 mb-3">
        <h3 className="text-sm font-medium leading-snug group-hover:text-accent transition-colors">
          {market.question}
        </h3>
        <span className="text-[11px] text-muted bg-background px-2 py-0.5 rounded-md whitespace-nowrap shrink-0">
          {formatCountdown(market.expiresAt)}
        </span>
      </div>

      <div className="flex items-center gap-2 mb-3">
        <PriceBar yesPrice={market.yesPrice} />
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <PriceChip label="Yes" price={market.yesPrice} variant="green" />
          <PriceChip label="No" price={market.noPrice} variant="red" />
        </div>
        <span className="text-xs text-muted">
          {formatCompact(volume)} {COLLATERAL_SYMBOL} vol
        </span>
      </div>
    </>
  );

  const baseClass =
    "w-full text-left p-4 rounded-xl bg-card border transition-all group " +
    (parlaySelected ? "border-accent ring-1 ring-accent/30" : "border-border hover:border-border-hover hover:bg-card-hover");

  if (parlayMode) {
    return (
      <div
        role="button"
        tabIndex={0}
        onClick={() => onParlayToggle?.(market)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onParlayToggle?.(market);
          }
        }}
        className={`${baseClass} flex gap-3 cursor-pointer`}
      >
        <div
          className={`shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center mt-0.5 ${
            parlaySelected ? "bg-accent border-accent text-white" : "border-muted bg-background"
          }`}
        >
          {parlaySelected && <Check className="w-3 h-3" />}
        </div>
        <div className="min-w-0 flex-1">{content}</div>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => onSelect(market)}
      className={baseClass}
    >
      {content}
    </button>
  );
}

function PriceBar({ yesPrice }: { yesPrice: number }) {
  const pct = Math.max(2, Math.min(98, yesPrice * 100));
  return (
    <div className="w-full h-1.5 rounded-full bg-red/20 overflow-hidden">
      <div
        className="h-full rounded-full bg-green transition-all duration-500"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function PriceChip({
  label,
  price,
  variant,
}: {
  label: string;
  price: number;
  variant: "green" | "red";
}) {
  const colors =
    variant === "green"
      ? "bg-green-muted text-green"
      : "bg-red-muted text-red";

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold ${colors}`}
    >
      <span className="text-[10px] font-normal opacity-80">{label}</span>
      {formatPercent(price)}
    </span>
  );
}
