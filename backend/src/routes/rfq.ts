import { Router } from "express";
import {
  getActiveRequests,
  getRecentFills,
  getGlobalStats,
  getMakerStats,
} from "../services/rfq.js";

const router = Router();

router.get("/active", (_req, res) => {
  res.json({ requests: getActiveRequests() });
});

router.get("/fills", (req, res) => {
  const limit = parseInt(req.query.limit as string) || 50;
  res.json({ fills: getRecentFills(limit) });
});

router.get("/stats", async (_req, res) => {
  const stats = await getGlobalStats();
  res.json({ stats });
});

router.get("/maker/:address", async (req, res) => {
  const stats = await getMakerStats(req.params.address);
  res.json({ stats });
});

export default router;
