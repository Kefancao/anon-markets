"use client";

import { BarChart3, Clock, Zap } from "lucide-react";
import type { GlobalStats } from "../types";
import { formatCompact, formatTimeAgo } from "../lib/format";
import { COLLATERAL_SYMBOL } from "../lib/constants";

interface StatsBarProps {
  stats: GlobalStats | null;
}

export function StatsBar({ stats }: StatsBarProps) {
  if (!stats) return null;

  const items = [
    {
      icon: BarChart3,
      label: "Total Volume",
      value: `${formatCompact(Number(BigInt(stats.totalVolume)) / 1e18)} ${COLLATERAL_SYMBOL}`,
    },
    {
      icon: Zap,
      label: "Total RFQs",
      value: formatCompact(stats.totalRFQCount),
    },
    {
      icon: Clock,
      label: "Last RFQ",
      value: stats.lastRFQTimestamp > 0 ? formatTimeAgo(stats.lastRFQTimestamp) : "—",
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
      {items.map((item) => (
        <div
          key={item.label}
          className="flex items-center gap-3 px-4 py-3 rounded-xl bg-card border border-border"
        >
          <div className="w-9 h-9 rounded-lg bg-accent-muted flex items-center justify-center shrink-0">
            <item.icon className="w-4.5 h-4.5 text-accent" />
          </div>
          <div className="min-w-0">
            <div className="text-xs text-muted truncate">{item.label}</div>
            <div className="text-sm font-semibold">{item.value}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
