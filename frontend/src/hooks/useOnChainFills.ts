"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { ethers } from "ethers";
import type { FillRecord } from "../types";
import type { Market } from "../types";

const PREDICTION_MARKET = process.env.NEXT_PUBLIC_PREDICTION_MARKET_ADDRESS || "";
const CHAIN_ID = process.env.NEXT_PUBLIC_MONAD_CHAIN_ID || "10143";
const EXPLORER_API_URL = process.env.NEXT_PUBLIC_EXPLORER_API_URL || "https://api.etherscan.io/v2/api";
const EXPLORER_API_KEY = process.env.NEXT_PUBLIC_EXPLORER_API_KEY || "";

const FIRST_BLOCK = 15914463;
const POLL_INTERVAL_MS = 2000;

const SHARES_PURCHASED_TOPIC = ethers.id("SharesPurchased(bytes32,address,bool,uint256,uint256)");
const DATA_DECODER = new ethers.AbiCoder();

function normalizeMarketId(id: string): string {
  return (id.startsWith("0x") ? id : `0x${id}`).toLowerCase();
}

interface ExplorerLog {
  address: string;
  topics: string[];
  data: string;
  blockNumber: string;
  transactionHash: string;
  logIndex?: string;
}

function explorerLogToFill(
  log: ExplorerLog,
  marketMap: Map<string, string>
): FillRecord | null {
  try {
    const marketId = (log.topics[1] ?? "").toLowerCase();
    if (!marketId) return null;
    const data = log.data.startsWith("0x") ? log.data : "0x" + log.data;
    const decoded = DATA_DECODER.decode(["bool", "uint256", "uint256"], data);
    const isYes = decoded[0] as boolean;
    const amount = decoded[1] as bigint;
    const cost = decoded[2] as bigint;
    const logIndex = log.logIndex ?? "0";
    return {
      id: `${log.transactionHash}-${logIndex}`,
      txHash: log.transactionHash,
      marketId,
      question: marketMap.get(marketId) ?? "",
      amountUsd: Number(cost) / 1e18,
      side: isYes ? "yes" : "no",
      shares: amount.toString(),
    };
  } catch {
    return null;
  }
}

async function fetchLogsFromExplorer(
  fromBlock: number,
  toBlock: number | "latest"
): Promise<ExplorerLog[]> {
  const params = new URLSearchParams({
    chainid: CHAIN_ID,
    module: "logs",
    action: "getLogs",
    address: PREDICTION_MARKET,
    topic0: SHARES_PURCHASED_TOPIC,
    fromBlock: String(fromBlock),
    toBlock: String(toBlock),
    page: "1",
    offset: "500",
    apikey: EXPLORER_API_KEY,
  });
  const url = `${EXPLORER_API_URL}?${params.toString()}`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const data = (await res.json()) as { status?: string; message?: string; result?: unknown };
  if (!Array.isArray(data.result)) return [];
  return data.result as ExplorerLog[];
}

export function useOnChainFills(markets: Market[], refreshTrigger?: number) {
  const [fills, setFills] = useState<FillRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const marketsRef = useRef(markets);
  marketsRef.current = markets;
  const fetchingRef = useRef(false);
  const lastBlockRef = useRef(0);
  const didInitRef = useRef(false);

  const fetchFills = useCallback(async () => {
    if (!PREDICTION_MARKET || !EXPLORER_API_KEY || fetchingRef.current) return;
    fetchingRef.current = true;

    try {
      const currentMarkets = marketsRef.current;
      const marketMap = new Map<string, string>();
      for (const m of currentMarkets) {
        marketMap.set(normalizeMarketId(m.marketId), m.question);
      }

      if (!didInitRef.current) {
        didInitRef.current = true;
        setLoading(true);
        setError(null);

        const logs = await fetchLogsFromExplorer(FIRST_BLOCK, "latest");
        logs.sort((a, b) => Number(b.blockNumber) - Number(a.blockNumber));
        const allFills = logs
          .map((l) => explorerLogToFill(l, marketMap))
          .filter((f): f is FillRecord => f != null);

        if (logs.length > 0) {
          lastBlockRef.current = Math.max(
            ...logs.map((l) => Number(l.blockNumber))
          );
        }

        setFills(allFills);
        setLoading(false);
      } else {
        const from = lastBlockRef.current + 1;
        const logs = await fetchLogsFromExplorer(from, "latest");

        if (logs.length > 0) {
          lastBlockRef.current = Math.max(
            ...logs.map((l) => Number(l.blockNumber))
          );

          const newFills = logs
            .map((l) => explorerLogToFill(l, marketMap))
            .filter((f): f is FillRecord => f != null);

          setFills((prev) => {
            const merged = [...newFills.reverse(), ...prev];
            const seen = new Set<string>();
            return merged.filter((f) => {
              if (seen.has(f.id)) return false;
              seen.add(f.id);
              return true;
            });
          });
        }
      }
    } catch (e) {
      console.error("[useOnChainFills]", e);
      if (!didInitRef.current) {
        setError("Failed to load fills");
        setLoading(false);
      }
    } finally {
      fetchingRef.current = false;
    }
  }, []);

  useEffect(() => {
    didInitRef.current = false;
    lastBlockRef.current = 0;
    fetchFills();
    const interval = setInterval(fetchFills, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchFills, refreshTrigger]);

  return { fills, loading, error, refetch: fetchFills };
}
