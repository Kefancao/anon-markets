"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type { Market, RFQRequest, RecentFill, GlobalStats } from "../types";

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:3001/ws";

interface WSState {
  markets: Market[];
  activeRFQs: RFQRequest[];
  recentFills: RecentFill[];
  globalStats: GlobalStats | null;
  connected: boolean;
}

export function useWebSocket() {
  const wsRef = useRef<WebSocket | null>(null);
  const [state, setState] = useState<WSState>({
    markets: [],
    activeRFQs: [],
    recentFills: [],
    globalStats: null,
    connected: false,
  });

  const connect = useCallback(() => {
    try {
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        setState((s) => ({ ...s, connected: true }));
      };

      ws.onclose = () => {
        setState((s) => ({ ...s, connected: false }));
        setTimeout(connect, 3000);
      };

      ws.onerror = () => {
        ws.close();
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          switch (msg.type) {
            case "init":
              setState((s) => ({
                ...s,
                markets: msg.data.markets || s.markets,
                activeRFQs: msg.data.activeRFQs || s.activeRFQs,
                recentFills: msg.data.recentFills || s.recentFills,
              }));
              break;
            case "markets_update":
              setState((s) => ({ ...s, markets: msg.data }));
              break;
            case "rfq_update":
              setState((s) => ({
                ...s,
                activeRFQs: msg.data.activeRFQs || s.activeRFQs,
                recentFills: msg.data.recentFills || s.recentFills,
                globalStats: msg.data.globalStats || s.globalStats,
              }));
              break;
            case "global_stats":
              setState((s) => ({ ...s, globalStats: msg.data }));
              break;
          }
        } catch {
          // ignore parse errors
        }
      };
    } catch {
      setTimeout(connect, 3000);
    }
  }, []);

  useEffect(() => {
    connect();
    return () => {
      wsRef.current?.close();
    };
  }, [connect]);

  const sendMessage = useCallback((type: string, data?: Record<string, unknown>) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type, ...data }));
    }
  }, []);

  return { ...state, sendMessage };
}
