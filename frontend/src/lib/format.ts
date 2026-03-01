export function formatUSD(amount: string | number, decimals = 18): string {
  const num =
    typeof amount === "string"
      ? Number(BigInt(amount)) / 10 ** decimals
      : amount;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(num);
}

export function formatCompact(value: number | string): string {
  const num = typeof value === "string" ? parseFloat(value) : value;
  if (num >= 1_000_000_000)
    return `${(num / 1_000_000_000).toFixed(1)}B`;
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
  return num.toFixed(0);
}

export function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

export function formatBps(bps: number): string {
  return `${(bps / 100).toFixed(1)}%`;
}

export function formatTimeAgo(timestamp: number): string {
  const now = Math.floor(Date.now() / 1000);
  const diff = now - timestamp;

  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export function formatCountdown(expiresAt: number): string {
  const now = Math.floor(Date.now() / 1000);
  const diff = expiresAt - now;
  if (diff <= 0) return "Expired";

  const days = Math.floor(diff / 86400);
  const hours = Math.floor((diff % 86400) / 3600);

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${Math.floor((diff % 3600) / 60)}m`;
  return `${Math.floor(diff / 60)}m`;
}

export function shortenAddress(addr: string, chars = 4): string {
  if (addr.length <= chars * 2 + 2) return addr;
  return `${addr.slice(0, chars + 2)}...${addr.slice(-chars)}`;
}

export function volumeFromShares(shares: string, decimals = 18): number {
  return Number(BigInt(shares)) / 10 ** decimals;
}
