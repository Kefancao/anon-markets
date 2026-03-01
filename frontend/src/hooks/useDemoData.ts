"use client";

import { useState, useEffect } from "react";
import type { Market, GlobalStats, RecentFill } from "../types";
import { getMarkets } from "../lib/api";

const DEMO_MARKETS: Market[] = [{
  marketId: "0xe4aab3eb4ca349ebd647ad869f50bd01f1d841636c65e9c8249907ed0687c01e",
  question: "Will Anon Markets win the Ship Private Ship Fast hackathon?",
  createdAt: Math.floor(Date.now() / 1000) - 172800,
  expiresAt: Math.floor(new Date("2026-03-02").getTime() / 1000),
  status: 0,
  outcome: 0,
  oracle: "0x0000000000000000000000000000000000000001",
  totalYesShares: "7800000000000000000000",
  totalNoShares: "2200000000000000000000",
  totalVolume: "13870000000000000000000000",
  yesPrice: 0.78,
  noPrice: 0.22,
},
{
  marketId: "0x8e0bb60bc9df8dffddb707ee284f4211730a60d0ad01e25521210eba5c4a5c14",
  question: "Will Ethereum ETF inflows surpass $50B by end of 2026?",
  createdAt: Math.floor(Date.now() / 1000) - 259200,
  expiresAt: Math.floor(new Date("2026-12-31").getTime() / 1000),
  status: 0,
  outcome: 0,
  oracle: "0x0000000000000000000000000000000000000002",
  totalYesShares: "4100000000000000000000",
  totalNoShares: "5900000000000000000000",
  totalVolume: "19300000000000000000000",
  yesPrice: 0.41,
  noPrice: 0.59,
},
{
  marketId: "0xf56856c4679e3c9889d8b463c8c21bb7867ac259d482a02a593547da8200cb53",
  question: "Will SpaceX successfully land humans on Mars before 2030?",
  createdAt: Math.floor(Date.now() / 1000) - 86400 * 7,
  expiresAt: Math.floor(new Date("2030-12-31").getTime() / 1000),
  status: 0,
  outcome: 0,
  oracle: "0x0000000000000000000000000000000000000004",
  totalYesShares: "1500000000000000000000",
  totalNoShares: "8500000000000000000000",
  totalVolume: "83820000000000000000000",
  yesPrice: 0.15,
  noPrice: 0.85,
},
{
  marketId: "0x80fc27271d3a34101086871a41c8913681e9897e028cc3fae641881c3335fa8d",
  question: "Will an AI system win a Nobel Prize before 2035?",
  createdAt: Math.floor(Date.now() / 1000) - 86400 * 10,
  expiresAt: Math.floor(new Date("2035-12-31").getTime() / 1000),
  status: 0,
  outcome: 0,
  oracle: "0x0000000000000000000000000000000000000005",
  totalYesShares: "2800000000000000000000",
  totalNoShares: "7200000000000000000000",
  totalVolume: "19827000000000000000000",
  yesPrice: 0.28,
  noPrice: 0.72,
},
{
  marketId: "0xf7acd820722146c9eeb70591c8c80b07c1f769793b76c444439062e34f8785d5",
  question: "Will a BRICS nation launch a CBDC used by over 100M people by 2028?",
  createdAt: Math.floor(Date.now() / 1000) - 86400 * 3,
  expiresAt: Math.floor(new Date("2028-12-31").getTime() / 1000),
  status: 0,
  outcome: 0,
  oracle: "0x0000000000000000000000000000000000000006",
  totalYesShares: "6700000000000000000000",
  totalNoShares: "3300000000000000000000",
  totalVolume: "8737000000000000000000",
  yesPrice: 0.67,
  noPrice: 0.33,
},
{
  marketId: "0x4d43fbe3ed564c3643aef0eedc9d738c90d76ea9cbbc0a87f4b479f8f2fe485e",
  question: "Will the Lakers beat the Warriors in their March 1, 2026 NBA matchup?",
  createdAt: Math.floor(Date.now() / 1000) - 3600,
  expiresAt: Math.floor(new Date("2026-03-01T17:30:00Z").getTime() / 1000),
  status: 0,
  outcome: 0,
  oracle: "0x0000000000000000000000000000000000000101",
  totalYesShares: "5800000000000000000000",
  totalNoShares: "4200000000000000000000",
  totalVolume: "39920000000000000000000",
  yesPrice: 0.58,
  noPrice: 0.42,
},
{
  marketId: "0x0ceca4753faf117181bd49667d1fecd8930bc9dfee24aabd34135082c57ff60b",
  question: "Will the 76ers cover the spread vs Celtics on March 1, 2026?",
  createdAt: Math.floor(Date.now() / 1000) - 3600 * 2,
  expiresAt: Math.floor(new Date("2026-03-01T17:00:00Z").getTime() / 1000),
  status: 0,
  outcome: 0,
  oracle: "0x0000000000000000000000000000000000000102",
  totalYesShares: "4900000000000000000000",
  totalNoShares: "5100000000000000000000",
  totalVolume: "29800000000000000000000",
  yesPrice: 0.49,
  noPrice: 0.51,
},
{
  marketId: "0x52fabee3eb72ca5094f09a6e974b586d5e9003083e8e9f9fbe49fae5e5b35a82",
  question: "Will Michigan State beat Indiana in their March 1 Big Ten college basketball game?",
  createdAt: Math.floor(Date.now() / 1000) - 86400,
  expiresAt: Math.floor(new Date("2026-03-01T21:00:00Z").getTime() / 1000),
  status: 0,
  outcome: 0,
  oracle: "0x0000000000000000000000000000000000000103",
  totalYesShares: "5500000000000000000000",
  totalNoShares: "4500000000000000000000",
  totalVolume: "10000000000000000000000",
  yesPrice: 0.55,
  noPrice: 0.45,
},
{
  marketId: "0xf5964c1c8c6f7a1db7e0e5cd6a784bc6316477b70348ddfd1c970e2f372acd89",
  question: "Will Rangers beat Celtic in the Scottish Premiership on March 1, 2026?",
  createdAt: Math.floor(Date.now() / 1000) - 3600 * 3,
  expiresAt: Math.floor(new Date("2026-03-01T12:00:00Z").getTime() / 1000),
  status: 0,
  outcome: 0,
  oracle: "0x0000000000000000000000000000000000000104",
  totalYesShares: "5300000000000000000000",
  totalNoShares: "4700000000000000000000",
  totalVolume: "10000000000000000000000",
  yesPrice: 0.53,
  noPrice: 0.47,
},
{
  marketId: "0xdd546ae2e8aad86393400bb419a0c4107a7ebc36038bccda5555ce4884079905",
  question: "At the Cognizant Classic (PGA), will a top-20 world ranked golfer win the event?",
  createdAt: Math.floor(Date.now() / 1000) - 86400 * 2,
  expiresAt: Math.floor(new Date("2026-03-01T23:59:59Z").getTime() / 1000),
  status: 0,
  outcome: 0,
  oracle: "0x0000000000000000000000000000000000000105",
  totalYesShares: "4600000000000000000000",
  totalNoShares: "5400000000000000000000",
  totalVolume: "10000000000000000000000",
  yesPrice: 0.46,
  noPrice: 0.54,
},
];

const DEMO_STATS: GlobalStats = {
  totalRFQCount: 1247,
  totalFilledCount: 983,
  totalVolume: "125000000000000000000000",
  lastRFQTimestamp: Math.floor(Date.now() / 1000) - 12,
  quoteToFillRatioBps: 7880,
};

function randomFills(): RecentFill[] {
  return Array.from({ length: 8 }, (_, i) => ({
    responseId: `0x${(i + 1).toString(16).padStart(64, "0")}`,
    requestId: `0x${(i + 100).toString(16).padStart(64, "0")}`,
    price: (Math.random() * 0.8 + 0.1).toFixed(4),
    size: (Math.random() * 5000 + 100).toFixed(0),
    timestamp: Math.floor(Date.now() / 1000) - Math.floor(Math.random() * 300),
  }));
}

export function useDemoData() {
  const [markets, setMarkets] = useState<Market[]>(DEMO_MARKETS);
  const [globalStats, setGlobalStats] = useState<GlobalStats>(DEMO_STATS);
  const [recentFills, setRecentFills] = useState<RecentFill[]>(randomFills());

  // Prefer markets from API (real on-chain IDs from backend backfill) so trades don't revert
  useEffect(() => {
    getMarkets()
      .then((data) => {
        if (data?.markets?.length) setMarkets(data.markets);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      setMarkets((prev) =>
        prev.map((m) => ({
          ...m,
          yesPrice: Math.max(0.01, Math.min(0.99, m.yesPrice + (Math.random() - 0.5) * 0.02)),
          noPrice: Math.max(0.01, Math.min(0.99, m.noPrice + (Math.random() - 0.5) * 0.02)),
        }))
      );

      setGlobalStats((prev) => ({
        ...prev,
        totalRFQCount: prev.totalRFQCount + Math.floor(Math.random() * 3),
        totalFilledCount: prev.totalFilledCount + Math.floor(Math.random() * 2),
        lastRFQTimestamp: Math.floor(Date.now() / 1000) - Math.floor(Math.random() * 30),
      }));

      setRecentFills(randomFills());
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  return { markets, globalStats, recentFills, connected: true };
}
