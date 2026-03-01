const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

async function fetchJSON<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export async function getMarkets() {
  return fetchJSON<{ markets: import("../types").Market[] }>("/api/markets");
}

export async function getMarket(marketId: string) {
  return fetchJSON<{ market: import("../types").Market }>(
    `/api/markets/${marketId}`
  );
}

export async function getActiveRFQs() {
  return fetchJSON<{ requests: import("../types").RFQRequest[] }>(
    "/api/rfq/active"
  );
}

export async function getRecentFills(limit = 50) {
  return fetchJSON<{ fills: import("../types").RecentFill[] }>(
    `/api/rfq/fills?limit=${limit}`
  );
}

export async function getGlobalStats() {
  return fetchJSON<{ stats: import("../types").GlobalStats }>("/api/rfq/stats");
}

export async function getMakerStats(address: string) {
  return fetchJSON<{ stats: import("../types").MakerStats }>(
    `/api/rfq/maker/${address}`
  );
}

export async function getFills(limit = 50) {
  const res = await fetch(`${API_BASE}/api/fills?limit=${limit}`, {
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json() as Promise<{ fills: import("../types").FillRecord[] }>;
}

export async function recordFill(data: {
  txHash: string;
  marketId: string;
  question: string;
  amountUsd: number;
  side: "yes" | "no";
  shares: string;
}) {
  const res = await fetch(`${API_BASE}/api/fills`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json() as Promise<{ fill: import("../types").FillRecord }>;
}

export async function getPositions(adapterAddress: string) {
  const res = await fetch(
    `${API_BASE}/api/positions?adapter=${encodeURIComponent(adapterAddress)}`,
    { cache: "no-store" }
  );
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json() as Promise<{ positions: import("../types").Position[] }>;
}
