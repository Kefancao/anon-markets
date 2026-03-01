import express from "express";
import cors from "cors";
import http from "http";
import { config } from "./config.js";
import { initWebSocket } from "./services/websocket.js";
import { startRFQEventListener } from "./services/rfq.js";
import {
  seedDemoMarkets,
  startMarketEventListener,
  backfillMarketsFromChain,
} from "./services/markets.js";
import { initFaucet } from "./services/faucet.js";
import marketsRouter from "./routes/markets.js";
import rfqRouter from "./routes/rfq.js";
import faucetRouter from "./routes/faucet.js";
import ammRouter from "./routes/amm.js";
import fillsRouter from "./routes/fills.js";
import positionsRouter from "./routes/positions.js";

const app = express();
app.use(cors());
app.use(express.json());

app.use("/api/markets", marketsRouter);
app.use("/api/rfq", rfqRouter);
app.use("/api/faucet", faucetRouter);
app.use("/api/amm", ammRouter);
app.use("/api/fills", fillsRouter);
app.use("/api/positions", positionsRouter);

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", chain: "monad", chainId: config.monad.chainId });
});

const server = http.createServer(app);
initWebSocket(server);

async function start() {
  const backfilled = await backfillMarketsFromChain();
  if (backfilled === 0) {
    seedDemoMarkets();
  }
  startRFQEventListener();
  startMarketEventListener();
  initFaucet().catch((e) => console.error("[Faucet] Init error:", e));
  server.listen(config.port, () => {
    console.log(`[Server] Anon Market backend running on port ${config.port}`);
    console.log(`[Server] Monad RPC: ${config.monad.rpcUrl}`);
    console.log(`[Server] WebSocket: ws://localhost:${config.port}/ws`);
  });
}
start();
