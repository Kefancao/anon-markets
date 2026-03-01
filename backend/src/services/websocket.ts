import { WebSocketServer, WebSocket } from "ws";
import type { Server } from "http";
import { getActiveRequests, getRecentFills, getGlobalStats } from "./rfq.js";
import { getAllMarkets } from "./markets.js";

let wss: WebSocketServer;
const clients = new Set<WebSocket>();

export function initWebSocket(server: Server) {
  wss = new WebSocketServer({ server, path: "/ws" });

  wss.on("connection", (ws) => {
    clients.add(ws);
    console.log(`[WS] Client connected (${clients.size} total)`);

    ws.on("close", () => {
      clients.delete(ws);
      console.log(`[WS] Client disconnected (${clients.size} total)`);
    });

    ws.on("message", async (data) => {
      try {
        const msg = JSON.parse(data.toString());
        await handleMessage(ws, msg);
      } catch (e) {
        ws.send(JSON.stringify({ error: "Invalid message" }));
      }
    });

    // Send initial state
    sendToClient(ws, {
      type: "init",
      data: {
        markets: getAllMarkets(),
        activeRFQs: getActiveRequests(),
        recentFills: getRecentFills(20),
      },
    });
  });

  // Broadcast market updates every 5 seconds
  setInterval(() => {
    broadcast({
      type: "markets_update",
      data: getAllMarkets(),
    });
  }, 5000);

  // Broadcast RFQ updates every 2 seconds
  setInterval(async () => {
    const stats = await getGlobalStats();
    broadcast({
      type: "rfq_update",
      data: {
        activeRFQs: getActiveRequests(),
        recentFills: getRecentFills(10),
        globalStats: stats,
      },
    });
  }, 2000);

  console.log("[WS] WebSocket server initialized");
}

async function handleMessage(ws: WebSocket, msg: { type: string; [key: string]: unknown }) {
  switch (msg.type) {
    case "subscribe_market": {
      sendToClient(ws, {
        type: "market_data",
        data: getAllMarkets().find((m) => m.marketId === msg.marketId),
      });
      break;
    }
    case "get_rfqs": {
      sendToClient(ws, {
        type: "rfq_list",
        data: getActiveRequests(),
      });
      break;
    }
    case "get_stats": {
      const stats = await getGlobalStats();
      sendToClient(ws, {
        type: "global_stats",
        data: stats,
      });
      break;
    }
    default:
      ws.send(JSON.stringify({ error: `Unknown message type: ${msg.type}` }));
  }
}

function sendToClient(ws: WebSocket, payload: object) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

export function broadcast(payload: object) {
  const msg = JSON.stringify(payload);
  for (const ws of clients) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(msg);
    }
  }
}

export function broadcastRFQEvent(event: string, data: object) {
  broadcast({ type: `rfq_${event}`, data });
}
