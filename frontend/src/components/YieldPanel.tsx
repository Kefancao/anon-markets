"use client";

import { Sprout, Lock, TrendingUp } from "lucide-react";
import { useUnlink, useUnlinkBalance, formatAmount } from "@unlink-xyz/react";
import { COLLATERAL_SYMBOL } from "../lib/constants";

const STABLECOIN_ADDRESS = process.env.NEXT_PUBLIC_STABLECOIN_ADDRESS || "";

export function YieldPanel() {
  const { activeAccount } = useUnlink();
  const { balance, ready: balanceReady } = useUnlinkBalance(STABLECOIN_ADDRESS);

  const isConnected = !!activeAccount;
  const displayBalance =
    isConnected && balanceReady && balance > 0n
      ? formatAmount(balance, 18)
      : "—";

  return (
    <div className="rounded-xl bg-card border border-border overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
        <Sprout className="w-4 h-4 text-accent" />
        <h3 className="text-sm font-semibold">Stablecoin Yield</h3>
        <span className="ml-auto text-[10px] px-2 py-0.5 rounded-full bg-accent-muted text-accent font-medium">
          Auto-earn
        </span>
      </div>

      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs text-muted mb-0.5">Current APY</div>
            <div className="text-xl font-bold text-green">4.8%</div>
          </div>
          <div className="text-right">
            <div className="text-xs text-muted mb-0.5">Total Deposited</div>
            <div className="text-sm font-semibold">12.4M {COLLATERAL_SYMBOL}</div>
          </div>
        </div>

        <div className="p-3 rounded-lg bg-background space-y-2 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-muted">Your Deposit</span>
            <span>{displayBalance} {COLLATERAL_SYMBOL}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted">Accrued Yield</span>
            <span>—</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted">Yield Source</span>
            <span className="flex items-center gap-1">
              <Lock className="w-3 h-3 text-accent" />
              Private DeFi
            </span>
          </div>
        </div>

        <div className="text-[10px] text-muted flex items-start gap-1.5">
          <TrendingUp className="w-3 h-3 shrink-0 mt-0.5 text-accent" />
          <span>
            Idle stablecoins in your Unlink wallet automatically earn yield
            via the adapter. Deposits and earnings stay fully private.
          </span>
        </div>
      </div>
    </div>
  );
}
