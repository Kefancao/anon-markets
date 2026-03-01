import { Router } from "express";
import { getPositionsForAdapter, getAllMarkets } from "../services/markets.js";
import { getPredictionMarketContract } from "../services/chain.js";

const router = Router();

router.get("/", async (req, res) => {
  const adapter = (req.query.adapter as string)?.trim();
  if (!adapter || !adapter.startsWith("0x") || adapter.length !== 42) {
    res.status(400).json({ error: "Missing or invalid adapter address" });
    return;
  }

  const pm = getPredictionMarketContract();
  if (!pm) {
    console.warn("[Positions] PredictionMarket contract not configured — returning empty");
    res.json({ positions: [], _debug: "contract_not_configured" });
    return;
  }

  const markets = getAllMarkets();
  console.log(`[Positions] Querying ${markets.length} market(s) for adapter ${adapter}`);

  try {
    const positions = await getPositionsForAdapter(adapter);
    console.log(`[Positions] Found ${positions.length} position(s)`);
    res.json({ positions });
  } catch (e) {
    console.warn("[Positions] Error:", e);
    res.status(500).json({ error: "Failed to fetch positions" });
  }
});

export default router;
