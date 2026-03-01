import { Router } from "express";

export interface StoredFill {
  id: string;
  txHash: string;
  marketId: string;
  question: string;
  amountUsd: number;
  side: "yes" | "no";
  shares: string;
}

const store: StoredFill[] = [];
const MAX_FILLS = 200;

const router = Router();

router.post("/", (req, res) => {
  const { txHash, marketId, question, amountUsd, side, shares } = req.body as Partial<StoredFill>;
  if (!txHash || !marketId || typeof amountUsd !== "number") {
    res.status(400).json({ error: "Missing txHash, marketId, or amountUsd" });
    return;
  }
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const fill: StoredFill = {
    id,
    txHash: String(txHash),
    marketId: String(marketId),
    question: question != null ? String(question) : "",
    amountUsd: Number(amountUsd),
    side: side === "no" ? "no" : "yes",
    shares: shares ? String(shares) : "0",
  };
  store.unshift(fill);
  if (store.length > MAX_FILLS) store.pop();
  res.status(201).json({ fill });
});

router.get("/", (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 50, 100);
  res.json({ fills: store.slice(0, limit) });
});

/** Aggregate fills into per-market positions */
router.get("/positions", (_req, res) => {
  const map = new Map<
    string,
    { marketId: string; question: string; yesShares: bigint; noShares: bigint; costUsd: number }
  >();
  for (const f of store) {
    let entry = map.get(f.marketId);
    if (!entry) {
      entry = { marketId: f.marketId, question: f.question, yesShares: 0n, noShares: 0n, costUsd: 0 };
      map.set(f.marketId, entry);
    }
    const sharesBI = BigInt(f.shares || "0");
    if (f.side === "yes") {
      entry.yesShares += sharesBI;
    } else {
      entry.noShares += sharesBI;
    }
    entry.costUsd += f.amountUsd;
    if (f.question && !entry.question) entry.question = f.question;
  }
  const positions = Array.from(map.values())
    .filter((e) => e.yesShares > 0n || e.noShares > 0n)
    .map((e) => ({
      marketId: e.marketId,
      question: e.question,
      yesShares: e.yesShares.toString(),
      noShares: e.noShares.toString(),
      costUsd: e.costUsd,
    }));
  res.json({ positions });
});

export default router;
