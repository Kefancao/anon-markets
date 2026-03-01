import { getPredictionMarketContract, getProvider } from "./chain.js";

export interface MarketInfo {
  marketId: string;
  question: string;
  createdAt: number;
  expiresAt: number;
  status: number;
  outcome: number;
  oracle: string;
  totalYesShares: string;
  totalNoShares: string;
  totalVolume: string;
  yesPrice: number;
  noPrice: number;
}

// In-memory market list (populated from chain events + seeded data)
const marketCache = new Map<string, MarketInfo>();

export function seedDemoMarkets() {
  const demoMarkets: MarketInfo[] = [{
    marketId: "0xe4aab3eb4ca349ebd647ad869f50bd01f1d841636c65e9c8249907ed0687c01e",
    question: "Will Anon Markets win the Ship Private Ship Fast hackathon?",
    createdAt: Math.floor(Date.now() / 1000) - 172800,
    expiresAt: Math.floor(new Date("2026-03-02").getTime() / 1000),
    status: 0,
    outcome: 0,
    oracle: "0x0000000000000000000000000000000000000001",
    totalYesShares: "7800000000000000000000",
    totalNoShares: "2200000000000000000000",
    totalVolume: "38200000000000000000000",
    yesPrice: 0.78,
    noPrice: 0.22,
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
    totalVolume: "23827000000000000000000",
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
    totalVolume: "827300000000000000000",
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
    marketId: "0x8e0bb60bc9df8dffddb707ee284f4211730a60d0ad01e25521210eba5c4a5c14",
    question: "Will Ethereum ETF inflows surpass $50B by end of 2026?",
    createdAt: Math.floor(Date.now() / 1000) - 259200,
    expiresAt: Math.floor(new Date("2026-12-31").getTime() / 1000),
    status: 0,
    outcome: 0,
    oracle: "0x0000000000000000000000000000000000000002",
    totalYesShares: "4100000000000000000000",
    totalNoShares: "5900000000000000000000",
    totalVolume: "29830000000000000000000",
    yesPrice: 0.41,
    noPrice: 0.59,
  },
  {
    marketId: "0x024d86b22b2d2435695bc289dc6421ef2797043b6620058439da44cda92cfcc3",
    question: "Will Anon Markets win the Ship Private Ship Fast hackathon?",
    createdAt: Math.floor(Date.now() / 1000) - 86400 * 5,
    expiresAt: Math.floor(new Date("2026-12-31").getTime() / 1000),
    status: 0,
    outcome: 0,
    oracle: "0x0000000000000000000000000000000000000003",
    totalYesShares: "7800000000000000000000",
    totalNoShares: "2200000000000000000000",
    totalVolume: "18200000000000000000000",
    yesPrice: 0.78,
    noPrice: 0.22,
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
    totalVolume: "1800000000000000000000",
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
    totalVolume: "92830000000000000000000",
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
    totalVolume: "29830000000000000000",
    yesPrice: 0.67,
    noPrice: 0.33,
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

  for (const m of demoMarkets) {
    marketCache.set(m.marketId, m);
  }
}

export function getAllMarkets(): MarketInfo[] {
  return Array.from(marketCache.values());
}

export function getMarket(marketId: string): MarketInfo | undefined {
  return marketCache.get(marketId);
}

export interface PositionInfo {
  marketId: string;
  question: string;
  yesShares: string;
  noShares: string;
  status: number;
  outcome: number;
}

export async function getPositionsForAdapter(
  adapterAddress: string
): Promise<PositionInfo[]> {
  const pm = getPredictionMarketContract();
  if (!pm) return [];
  const markets = getAllMarkets();
  const results: PositionInfo[] = [];
  for (const m of markets) {
    try {
      const [yesShares, noShares] = (await pm.getShares(
        m.marketId,
        adapterAddress
      )) as [bigint, bigint];
      const yes = typeof yesShares === "bigint" ? yesShares : BigInt(String(yesShares));
      const no = typeof noShares === "bigint" ? noShares : BigInt(String(noShares));
      if (yes > 0n || no > 0n) {
        results.push({
          marketId: m.marketId,
          question: m.question,
          yesShares: yes.toString(),
          noShares: no.toString(),
          status: m.status,
          outcome: m.outcome,
        });
      }
    } catch {
      // skip market on RPC/contract error
    }
  }
  return results;
}

export function startMarketEventListener() {
  try {
    const pm = getPredictionMarketContract();
    if (!pm) {
      console.log("[Market] No contract address configured — event listener skipped");
      return;
    }

    pm.on("MarketCreated", (marketId: string, question: string, expiresAt: bigint, oracle: string) => {
      console.log(`[Market] Created: ${marketId}`);
      marketCache.set(marketId, {
        marketId,
        question,
        createdAt: Math.floor(Date.now() / 1000),
        expiresAt: Number(expiresAt),
        status: 0,
        outcome: 0,
        oracle,
        totalYesShares: "0",
        totalNoShares: "0",
        totalVolume: "0",
        yesPrice: 0.5,
        noPrice: 0.5,
      });
    });

    pm.on("MarketResolved", (marketId: string, outcome: number) => {
      console.log(`[Market] Resolved: ${marketId} -> ${outcome}`);
      const m = marketCache.get(marketId);
      if (m) {
        m.status = 2;
        m.outcome = outcome;
      }
    });

    pm.on("SharesPurchased", (marketId: string, _buyer: string, isYes: boolean, amount: bigint, cost: bigint) => {
      const m = marketCache.get(marketId);
      if (m) {
        if (isYes) {
          m.totalYesShares = (BigInt(m.totalYesShares) + amount).toString();
        } else {
          m.totalNoShares = (BigInt(m.totalNoShares) + amount).toString();
        }
        m.totalVolume = (BigInt(m.totalVolume) + cost).toString();

        const totalShares = BigInt(m.totalYesShares) + BigInt(m.totalNoShares);
        if (totalShares > 0n) {
          m.yesPrice = Number(BigInt(m.totalYesShares) * 10000n / totalShares) / 10000;
          m.noPrice = 1 - m.yesPrice;
        }
      }
    });

    console.log("[Market] Event listener started");
  } catch (e) {
    console.warn("[Market] Could not start event listener:", e);
  }
}

/**
 * Backfill market cache from chain (MarketCreated events).
 * Use this so the app has real market IDs; otherwise mintShares will revert and the broadcaster returns 400 when polling.
 */
export async function backfillMarketsFromChain(): Promise<number> {
  const pm = getPredictionMarketContract();
  if (!pm) return 0;
  try {
    const provider = getProvider();
    const toBlock = await provider.getBlockNumber();
    const fromBlock = Math.max(0, toBlock - 500_000);
    const events = await pm.queryFilter(
      pm.filters.MarketCreated(),
      fromBlock,
      toBlock
    );
    for (const ev of events) {
      const args = (ev as { args?: unknown[] | Record<string, unknown> }).args;
      if (!args) continue;
      const marketId = (Array.isArray(args) ? args[0] : args.marketId) as string;
      const question = (Array.isArray(args) ? args[1] : args.question) as string;
      const expiresAt = Number(Array.isArray(args) ? args[2] : args.expiresAt);
      const oracle = (Array.isArray(args) ? args[3] : args.oracle) as string;
      if (!marketId || !question) continue;
      marketCache.set(marketId, {
        marketId,
        question,
        createdAt: ev.blockNumber ? Math.floor(Date.now() / 1000) : 0,
        expiresAt,
        status: 0,
        outcome: 0,
        oracle,
        totalYesShares: "0",
        totalNoShares: "0",
        totalVolume: "0",
        yesPrice: 0.5,
        noPrice: 0.5,
      });
    }
    if (events.length > 0) {
      console.log(`[Market] Backfilled ${events.length} market(s) from chain`);
    }
    return events.length;
  } catch (e) {
    console.warn("[Market] Backfill failed:", e);
    return 0;
  }
}
