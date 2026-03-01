import { Router } from "express";
import { dripToAddress, getFaucetStatus, getFaucetUnavailableReason, isFaucetReady } from "../services/faucet.js";

const router = Router();

router.get("/status", (_req, res) => {
  res.json(getFaucetStatus());
});

router.post("/drip", async (req, res) => {
  if (!isFaucetReady()) {
    res.status(503).json({ error: getFaucetUnavailableReason() || "Faucet not available" });
    return;
  }

  const { unlinkAddress } = req.body;
  if (!unlinkAddress || typeof unlinkAddress !== "string") {
    res.status(400).json({ error: "Missing unlinkAddress" });
    return;
  }

  if (!unlinkAddress.startsWith("unlink1")) {
    res.status(400).json({ error: "Invalid Unlink address format" });
    return;
  }

  const result = await dripToAddress(unlinkAddress);

  if (!result.success) {
    res.status(429).json({ error: result.error });
    return;
  }

  res.json({
    success: true,
    relayId: result.relayId,
    txHash: result.txHash,
    amount: "100",
  });
});

export default router;
