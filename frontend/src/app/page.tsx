"use client";

import { useState, useCallback } from "react";
import { Search, Link2 } from "lucide-react";
import { Header } from "../components/Header";
import { StatsBar } from "../components/StatsBar";
import { MarketCard } from "../components/MarketCard";
import { MarketDetail } from "../components/MarketDetail";
import { RecentFills } from "../components/RecentFills";
import { YieldPanel } from "../components/YieldPanel";
import { ParlayPanel, type ParlayLegSelection } from "../components/ParlayPanel";
import { PortfolioPanel } from "../components/PortfolioPanel";
import { useDemoData } from "../hooks/useDemoData";
import type { Market } from "../types";

export default function Home() {
  const { markets, globalStats } = useDemoData();
  const [selectedMarket, setSelectedMarket] = useState<Market | null>(null);
  const [view, setView] = useState<"markets" | "portfolio">("markets");
  const [parlayMode, setParlayMode] = useState(false);
  const [parlayLegs, setParlayLegs] = useState<ParlayLegSelection[]>([]);
  const [fillsRefreshTrigger, setFillsRefreshTrigger] = useState(0);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "trending" | "new" | "closing">(
    "all"
  );

  const toggleParlayLeg = useCallback((market: Market) => {
    setParlayLegs((prev) => {
      const i = prev.findIndex((l) => l.market.marketId === market.marketId);
      if (i >= 0) {
        return prev.filter((_, j) => j !== i);
      }
      return [...prev, { market, isYes: true }];
    });
  }, []);

  const removeParlayLeg = useCallback((marketId: string) => {
    setParlayLegs((prev) => prev.filter((l) => l.market.marketId !== marketId));
  }, []);

  const filteredMarkets = markets.filter((m) => {
    if (search) {
      return m.question.toLowerCase().includes(search.toLowerCase());
    }
    if (filter === "trending") {
      return Number(BigInt(m.totalVolume)) / 1e18 > 10000;
    }
    if (filter === "new") {
      return m.createdAt > Math.floor(Date.now() / 1000) - 86400;
    }
    if (filter === "closing") {
      return m.expiresAt < Math.floor(Date.now() / 1000) + 86400 * 30;
    }
    return true;
  });

  const handleSelectMarketFromFill = useCallback(
    (marketId: string) => {
      const m = markets.find((x) => x.marketId === marketId);
      if (m) {
        setSelectedMarket(m);
        setView("markets");
      }
    },
    [markets]
  );

  return (
    <div className="min-h-screen flex flex-col">
      <Header view={view} onNavigate={setView} />

      <main className="flex-1 max-w-[1400px] mx-auto w-full px-4 py-6 space-y-6">
        <StatsBar stats={globalStats} />

        {view === "portfolio" ? (
          <PortfolioPanel
            markets={markets}
            onSelectMarket={(marketId) => {
              const m = markets.find((x) => x.marketId === marketId);
              if (m) {
                setSelectedMarket(m);
                setView("markets");
              }
            }}
          />
        ) : selectedMarket ? (
          <MarketDetail
            market={selectedMarket}
            onBack={() => setSelectedMarket(null)}
            onFillRecorded={() => setFillsRefreshTrigger((t) => t + 1)}
          />
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            {/* Markets list */}
            <div className="lg:col-span-3 space-y-4">
              {/* Search + filters + Parlay toggle */}
              <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search markets..."
                    className="w-full pl-9 pr-3 py-2.5 rounded-lg bg-card border border-border focus:border-accent focus:outline-none text-sm placeholder:text-muted/50"
                  />
                </div>
                <div className="flex gap-1 p-0.5 bg-card border border-border rounded-lg">
                  {(
                    [
                      ["all", "All"],
                      ["trending", "Trending"],
                      ["new", "New"],
                      ["closing", "Closing Soon"],
                    ] as const
                  ).map(([key, label]) => (
                    <button
                      key={key}
                      onClick={() => setFilter(key)}
                      className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                        filter === key
                          ? "bg-accent-muted text-accent"
                          : "text-muted hover:text-foreground"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setParlayMode((p) => {
                      if (p) setParlayLegs([]);
                      return !p;
                    });
                  }}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-medium transition-all shrink-0 ${
                    parlayMode
                      ? "bg-accent-muted text-accent border-accent"
                      : "bg-card border-border text-muted hover:text-foreground hover:border-border-hover"
                  }`}
                >
                  <Link2 className="w-3.5 h-3.5" />
                  Parlay
                </button>
              </div>

              {/* Market grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {filteredMarkets.map((market) => (
                  <MarketCard
                    key={market.marketId}
                    market={market}
                    onSelect={setSelectedMarket}
                    parlayMode={parlayMode}
                    parlaySelected={parlayLegs.some((l) => l.market.marketId === market.marketId)}
                    onParlayToggle={parlayMode ? toggleParlayLeg : undefined}
                  />
                ))}
              </div>

              {filteredMarkets.length === 0 && (
                <div className="py-12 text-center text-muted text-sm">
                  No markets found
                </div>
              )}
            </div>

            {/* Sidebar */}
            <div className="space-y-4">
              {parlayMode && (
                <ParlayPanel
                  legs={parlayLegs}
                  onRemoveLeg={removeParlayLeg}
                  onFillRecorded={() => setFillsRefreshTrigger((t) => t + 1)}
                />
              )}
              <YieldPanel />

              <RecentFills
                markets={markets}
                onSelectMarket={handleSelectMarketFromFill}
                refreshTrigger={fillsRefreshTrigger}
              />
            </div>
          </div>
        )}
      </main>

      <footer className="border-t border-border py-4 px-4">
        <div className="max-w-[1400px] mx-auto flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-muted">
          <span>Anon Market — Private Prediction Markets</span>
          <div className="flex items-center gap-4">
            <span>
              Powered by{" "}
              <a
                href="https://docs.unlink.xyz"
                target="_blank"
                rel="noopener"
                className="text-accent hover:text-accent-hover transition-colors"
              >
                Unlink
              </a>
            </span>
            <span>
              Settled on{" "}
              <a
                href="https://docs.monad.xyz"
                target="_blank"
                rel="noopener"
                className="text-accent hover:text-accent-hover transition-colors"
              >
                Monad
              </a>
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
