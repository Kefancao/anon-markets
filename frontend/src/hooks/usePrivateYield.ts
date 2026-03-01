"use client";

/**
 * Hook for managing stablecoin yield via Unlink's private DeFi adapter.
 *
 * Uses the SDK's useInteract hook (per docs best practice) instead of
 * manual loading/error state. The hook returns isPending/isError/error
 * automatically.
 *
 * Flow: unshield stablecoins → approve + deposit into YieldVault → reshield
 * All atomic in one transaction via the adapter.
 */

import { useCallback, useState } from "react";
import { useInteract, useUnlink, useTxStatus } from "@unlink-xyz/react";

const YIELD_VAULT_ADDRESS = process.env.NEXT_PUBLIC_YIELD_VAULT_ADDRESS || "";
const STABLECOIN_ADDRESS = process.env.NEXT_PUBLIC_STABLECOIN_ADDRESS || "";

export function usePrivateYield() {
  const { unlink } = useUnlink();
  const { interact, isPending, isSuccess, isError, error, reset } =
    useInteract();
  const [relayId, setRelayId] = useState<string | null>(null);
  const txStatus = useTxStatus(relayId);

  const depositToVault = useCallback(
    async (amount: bigint) => {
      reset();
      setRelayId(null);

      const { approve, buildCall } = await import("@unlink-xyz/core");

      const approveCall = approve(
        STABLECOIN_ADDRESS,
        YIELD_VAULT_ADDRESS,
        amount
      );

      const depositCall = buildCall({
        to: YIELD_VAULT_ADDRESS,
        abi: "function deposit(uint256 amount)",
        functionName: "deposit",
        args: [amount],
      });

      const result = await interact({
        spend: [{ token: STABLECOIN_ADDRESS, amount }],
        calls: [approveCall, depositCall],
        receive: [{ token: STABLECOIN_ADDRESS, minAmount: 0n }],
      });

      setRelayId(result.relayId);
      return result;
    },
    [interact, reset]
  );

  const withdrawFromVault = useCallback(
    async (amount: bigint) => {
      reset();
      setRelayId(null);

      const { buildCall } = await import("@unlink-xyz/core");

      const withdrawCall = buildCall({
        to: YIELD_VAULT_ADDRESS,
        abi: "function withdraw(uint256 amount)",
        functionName: "withdraw",
        args: [amount],
      });

      const result = await interact({
        spend: [],
        calls: [withdrawCall],
        receive: [{ token: STABLECOIN_ADDRESS, minAmount: amount }],
      });

      setRelayId(result.relayId);
      return result;
    },
    [interact, reset]
  );

  const claimYield = useCallback(
    async (minYield: bigint) => {
      reset();
      setRelayId(null);

      const { buildCall } = await import("@unlink-xyz/core");

      const claimCall = buildCall({
        to: YIELD_VAULT_ADDRESS,
        abi: "function claimYield()",
        functionName: "claimYield",
        args: [],
      });

      const result = await interact({
        spend: [],
        calls: [claimCall],
        receive: [{ token: STABLECOIN_ADDRESS, minAmount: minYield }],
      });

      setRelayId(result.relayId);
      return result;
    },
    [interact, reset]
  );

  return {
    depositToVault,
    withdrawFromVault,
    claimYield,
    isPending,
    isSuccess,
    isError,
    error,
    txStatus,
    ready: !!unlink,
  };
}
