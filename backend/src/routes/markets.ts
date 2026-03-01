import { Router } from "express";
import { getAllMarkets, getMarket } from "../services/markets.js";

const router = Router();

router.get("/", (_req, res) => {
  res.json({ markets: getAllMarkets() });
});

router.get("/:marketId", (req, res) => {
  const market = getMarket(req.params.marketId);
  if (!market) {
    res.status(404).json({ error: "Market not found" });
    return;
  }
  res.json({ market });
});

export default router;
