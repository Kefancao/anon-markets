"use client";

import { Shield, Eye, EyeOff } from "lucide-react";

export function PrivacyBadge() {
  return (
    <div className="rounded-xl bg-card border border-border overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
        <Shield className="w-4 h-4 text-accent" />
        <h3 className="text-sm font-semibold">Privacy Status</h3>
      </div>

      <div className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-green animate-pulse" />
          <span className="text-xs text-green font-medium">Fully Private</span>
        </div>

        <div className="space-y-2 text-xs">
          <PrivacyRow
            label="Balances"
            isPrivate
          />
          <PrivacyRow
            label="Transaction History"
            isPrivate
          />
          <PrivacyRow
            label="Collateral Positions"
            isPrivate
          />
          <PrivacyRow
            label="Settlement"
            isPrivate
          />
          <PrivacyRow
            label="Market Prices"
            isPrivate={false}
          />
          <PrivacyRow
            label="Volume Data"
            isPrivate={false}
          />
        </div>

        <div className="text-[10px] text-muted pt-1 border-t border-border">
          Powered by{" "}
          <span className="text-accent font-medium">Unlink</span> on{" "}
          <span className="text-foreground font-medium">Monad</span>
        </div>
      </div>
    </div>
  );
}

function PrivacyRow({
  label,
  isPrivate,
}: {
  label: string;
  isPrivate: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted">{label}</span>
      {isPrivate ? (
        <span className="flex items-center gap-1 text-green">
          <EyeOff className="w-3 h-3" />
          Hidden
        </span>
      ) : (
        <span className="flex items-center gap-1 text-yellow">
          <Eye className="w-3 h-3" />
          Public
        </span>
      )}
    </div>
  );
}
