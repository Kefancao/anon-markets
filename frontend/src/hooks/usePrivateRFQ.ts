"use client";

/**
 * Hook for executing RFQ operations privately via Unlink.
 *
 * Uses the SDK's useInteract and useBurner hooks (per docs best practice)
 * instead of manual types and state management.
 *
 * Takers and makers interact with the RFQ contract through the adapter,
 * keeping identities, collateral, and positions private.
 */

import { useCallback, useState, useEffect, useRef } from "react";
import {
  useInteract,
  useUnlink,
  useTxStatus,
  useBurner,
} from "@unlink-xyz/react";

const RFQ_ENGINE_ADDRESS = process.env.NEXT_PUBLIC_RFQ_ENGINE_ADDRESS || "";
const COLLATERAL_TOKEN =
  process.env.NEXT_PUBLIC_COLLATERAL_TOKEN_ADDRESS || "";

export function usePrivateRFQ() {
  const { unlink } = useUnlink();
  const { interact, isPending, isError, error, reset } = useInteract();
  const {
    createBurner,
    fund: burnerFund,
    send: burnerSend,
    sweepToPool,
  } = useBurner();
  const [relayId, setRelayId] = useState<string | null>(null);
  const txStatus = useTxStatus(relayId);
  const errorCountRef = useRef(0);

  // Stop polling on first status error (400 from broadcaster = relay rejected or unknown)
  useEffect(() => {
    if (txStatus.error && relayId) {
      setRelayId(null);
      errorCountRef.current = 0;
    }
    if (txStatus.state && !txStatus.error) {
      errorCountRef.current = 0;
    }
  }, [txStatus.error, txStatus.state, relayId]);

  const requestQuotePrivately = useCallback(
    async (params: {
      marketId: string;
      isYes: boolean;
      size: bigint;
      maxPrice: bigint;
      duration: bigint;
    }) => {
      reset();
      setRelayId(null);

      const { approve, buildCall } = await import("@unlink-xyz/core");

      const approveCall = approve(
        COLLATERAL_TOKEN,
        RFQ_ENGINE_ADDRESS,
        params.size
      );

      const rfqCall = buildCall({
        to: RFQ_ENGINE_ADDRESS,
        abi: "function requestQuote(bytes32 marketId, bool isYes, uint256 size, uint256 maxPrice, uint256 duration) returns (bytes32)",
        functionName: "requestQuote",
        args: [
          params.marketId,
          params.isYes,
          params.size,
          params.maxPrice,
          params.duration,
        ],
      });

      // Adapter requires gain > 0 for reshield; unshield 1 wei extra.
      const result = await interact({
        spend: [{ token: COLLATERAL_TOKEN, amount: params.size + 1n }],
        calls: [approveCall, rfqCall],
        receive: [{ token: COLLATERAL_TOKEN, minAmount: 0n }],
      });

      setRelayId(result.relayId);
      return result;
    },
    [interact, reset]
  );

  const respondToQuotePrivately = useCallback(
    async (params: {
      requestId: string;
      price: bigint;
      size: bigint;
      duration: bigint;
    }) => {
      reset();
      setRelayId(null);

      const { approve, buildCall } = await import("@unlink-xyz/core");

      const counterCollateral =
        params.size - (params.price * params.size) / BigInt(1e18);

      const approveCall = approve(
        COLLATERAL_TOKEN,
        RFQ_ENGINE_ADDRESS,
        counterCollateral
      );

      const respondCall = buildCall({
        to: RFQ_ENGINE_ADDRESS,
        abi: "function respondToQuote(bytes32 requestId, uint256 price, uint256 size, uint256 duration) returns (bytes32)",
        functionName: "respondToQuote",
        args: [params.requestId, params.price, params.size, params.duration],
      });

      // Adapter requires gain > 0 for reshield; unshield 1 wei extra.
      const result = await interact({
        spend: [{ token: COLLATERAL_TOKEN, amount: counterCollateral + 1n }],
        calls: [approveCall, respondCall],
        receive: [{ token: COLLATERAL_TOKEN, minAmount: 0n }],
      });

      setRelayId(result.relayId);
      return result;
    },
    [interact, reset]
  );

  /**
   * Maker hedges privately using a burner account (per docs useBurner pattern).
   * Fund burner → execute hedge → sweep back to pool.
   */
  const hedgePrivately = useCallback(
    async (params: {
      burnerIndex: number;
      amount: bigint;
      hedgeCalldata: string;
      hedgeTarget: string;
    }) => {
      await createBurner(params.burnerIndex);

      await burnerFund.execute({
        index: params.burnerIndex,
        params: { token: COLLATERAL_TOKEN, amount: params.amount },
      });

      await burnerSend.execute({
        index: params.burnerIndex,
        tx: { to: params.hedgeTarget, data: params.hedgeCalldata },
      });

      await sweepToPool.execute({
        index: params.burnerIndex,
        params: { token: COLLATERAL_TOKEN },
      });
    },
    [createBurner, burnerFund, burnerSend, sweepToPool]
  );

  const clearRelay = useCallback(() => {
    setRelayId(null);
    errorCountRef.current = 0;
  }, []);

  return {
    requestQuotePrivately,
    respondToQuotePrivately,
    hedgePrivately,
    isPending,
    isError,
    error,
    txStatus,
    relayId,
    clearRelay,
    hedgePending: burnerFund.isPending || burnerSend.isPending || sweepToPool.isPending,
    ready: !!unlink,
  };
}
