import { Router } from "express";
import { ethers } from "ethers";
import { getAMMQuote, getParlayAMMQuote, getQuote, acceptQuote, getAMMStats } from "../services/amm.js";
import { getParlayEngineWithSigner } from "../services/chain.js";

const router = Router();
const PARLAY_QUOTE_DURATION_SEC = 60;
const PARLAY_QUOTED_TOPIC = ethers.id("ParlayQuoted(bytes32,bytes32,address,uint256)");

router.post("/quote", (req, res) => {
  const { marketId, side, size } = req.body;

  if (!marketId || !side || size == null) {
    res.status(400).json({ error: "Missing marketId, side, or size" });
    return;
  }

  if (side !== "yes" && side !== "no") {
    res.status(400).json({ error: "side must be 'yes' or 'no'" });
    return;
  }

  const sizeNum = parseFloat(size);
  if (isNaN(sizeNum) || sizeNum <= 0) {
    res.status(400).json({ error: "size must be a positive number" });
    return;
  }

  const result = getAMMQuote(marketId, side, sizeNum);

  if ("error" in result) {
    res.status(400).json({ error: result.error });
    return;
  }

  res.json({ quote: result });
});

router.post("/parlay-quote", (req, res) => {
  const { legs, size } = req.body;

  if (!Array.isArray(legs) || legs.length < 2 || size == null) {
    res.status(400).json({ error: "Missing legs (array of { marketId, side }) or size" });
    return;
  }

  const sizeNum = parseFloat(size);
  if (isNaN(sizeNum) || sizeNum <= 0) {
    res.status(400).json({ error: "size must be a positive number" });
    return;
  }

  const legInputs = legs.map((l: { marketId?: string; side?: string }) => ({
    marketId: String(l?.marketId ?? ""),
    side: l?.side === "no" ? "no" : "yes",
  }));

  const result = getParlayAMMQuote(legInputs, sizeNum);

  if ("error" in result) {
    res.status(400).json({ error: result.error });
    return;
  }

  res.json({ quote: result });
});

router.post("/parlay-submit-quote", async (req, res) => {
  const { parlayId, legPrices } = req.body;

  if (!parlayId || !Array.isArray(legPrices) || legPrices.length < 2) {
    res.status(400).json({ error: "Missing parlayId or legPrices (array, length >= 2)" });
    return;
  }

  const parlay = getParlayEngineWithSigner();
  if (!parlay) {
    res.status(503).json({ error: "Parlay maker not configured (set MASTER_MONAD_TOKEN_FAUCET_PRIVATE_KEY)" });
    return;
  }

  const parlayIdHex = parlayId.startsWith("0x") ? parlayId : `0x${parlayId}`;
  if (parlayIdHex.length !== 66) {
    res.status(400).json({ error: "Invalid parlayId" });
    return;
  }

  const pricesBigInt = legPrices.map((p: string | number) => {
    const n = typeof p === "string" ? BigInt(p) : BigInt(Math.round(Number(p)));
    if (n <= 0n || n > BigInt(1e18)) {
      throw new Error("Invalid leg price");
    }
    return n;
  });

  try {
    const tx = await parlay.quoteParlay(
      parlayIdHex,
      pricesBigInt,
      PARLAY_QUOTE_DURATION_SEC
    );
    const receipt = await tx.wait();

    const parlayAddr = (await parlay.getAddress()).toLowerCase();
    const log = receipt.logs.find(
      (l: { address: string; topics: string[] }) =>
        l.address.toLowerCase() === parlayAddr && l.topics[0] === PARLAY_QUOTED_TOPIC
    );
    if (!log || !log.topics[1]) {
      throw new Error("ParlayQuoted event not found in receipt");
    }
    const quoteIdHex = log.topics[1] as string;

    res.json({ quoteId: quoteIdHex });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "quoteParlay failed";
    res.status(400).json({ error: msg });
  }
});

router.get("/quote/:quoteId", (req, res) => {
  const quote = getQuote(req.params.quoteId);
  if (!quote) {
    res.status(404).json({ error: "Quote not found or expired" });
    return;
  }
  res.json({ quote });
});

router.post("/accept", (req, res) => {
  const { quoteId } = req.body;
  if (!quoteId) {
    res.status(400).json({ error: "Missing quoteId" });
    return;
  }

  const result = acceptQuote(quoteId);
  if ("error" in result) {
    res.status(400).json({ error: result.error });
    return;
  }

  res.json({ fill: result });
});

router.get("/stats", (_req, res) => {
  res.json(getAMMStats());
});

export default router;
