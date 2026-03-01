"use client";

/**
 * Simple direct trade: EOA approves, transfers collateral, and calls mintShares.
 * No Unlink — settles on-chain with the connected EVM wallet so you can verify mintShares works.
 */

import { useCallback, useState } from "react";
import { BrowserProvider, Contract, parseUnits } from "ethers";

const MONAD_CHAIN_ID = 10143;
const MONAD_RPC = "https://testnet-rpc.monad.xyz";

const ERC20_ABI = [
  "function approve(address spender, uint256 amount) returns (bool)",
  "function transfer(address to, uint256 amount) returns (bool)",
  "function balanceOf(address account) view returns (uint256)",
] as const;

const PREDICTION_MARKET_ABI = [
  "function mintShares(bytes32 marketId, address recipient, bool isYes, uint256 shares, uint256 cost)",
] as const;

const COLLATERAL_TOKEN = process.env.NEXT_PUBLIC_COLLATERAL_TOKEN_ADDRESS || "";
const PREDICTION_MARKET = process.env.NEXT_PUBLIC_PREDICTION_MARKET_ADDRESS || "";

function getEthereum(): (typeof window)["ethereum"] | null {
  if (typeof window === "undefined") return null;
  return (window as unknown as { ethereum?: typeof window.ethereum }).ethereum ?? null;
}

export function useDirectTrade() {
  const [txHash, setTxHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const buyDirect = useCallback(
    async (params: {
      marketId: string;
      isYes: boolean;
      amountUsd: string;
      price: number; // 0..1, e.g. market.yesPrice or market.noPrice
    }) => {
      const eth = getEthereum();
      if (!eth) {
        setError("No wallet found");
        return null;
      }
      if (!COLLATERAL_TOKEN || !PREDICTION_MARKET) {
        setError("Missing contract addresses");
        return null;
      }

      const amount = parseFloat(params.amountUsd);
      if (isNaN(amount) || amount <= 0) {
        setError("Invalid amount");
        return null;
      }

      setError(null);
      setTxHash(null);
      setPending(true);

      try {
        const provider = new BrowserProvider(eth);
        const network = await provider.getNetwork();
        if (Number(network.chainId) !== MONAD_CHAIN_ID) {
          try {
            await eth.request({
              method: "wallet_switchEthereumChain",
              params: [{ chainId: `0x${MONAD_CHAIN_ID.toString(16)}` }],
            });
          } catch (e) {
            setError("Switch to Monad Testnet (Chain ID 10143) in your wallet");
            setPending(false);
            return null;
          }
        }

        const signer = await provider.getSigner();
        const userAddress = await signer.getAddress();

        // 18 decimals: cost in token units
        const costWei = parseUnits(amount.toFixed(18), 18);
        const priceWei = BigInt(Math.floor(params.price * 1e18));
        if (priceWei === 0n) {
          setError("Invalid price");
          setPending(false);
          return null;
        }
        const sharesWei = (costWei * BigInt(1e18)) / priceWei;

        const collateral = new Contract(COLLATERAL_TOKEN, ERC20_ABI, signer);
        const market = new Contract(PREDICTION_MARKET, PREDICTION_MARKET_ABI, signer);

        // 1. Approve PredictionMarket to spend costWei
        const approveTx = await collateral.approve(PREDICTION_MARKET, costWei);
        await approveTx.wait();

        // 2. Transfer collateral to the contract (contract expects collateral already there)
        const transferTx = await collateral.transfer(PREDICTION_MARKET, costWei);
        await transferTx.wait();

        // 3. mintShares(marketId, recipient, isYes, shares, cost)
        const mintTx = await market.mintShares(
          params.marketId,
          userAddress,
          params.isYes,
          sharesWei,
          costWei
        );
        const receipt = await mintTx.wait();
        const hash = receipt?.hash ?? mintTx.hash;
        setTxHash(hash);
        setPending(false);
        return hash;
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Transaction failed";
        setError(msg);
        setPending(false);
        return null;
      }
    },
    []
  );

  const clear = useCallback(() => {
    setTxHash(null);
    setError(null);
  }, []);

  return { buyDirect, txHash, error, pending, clear };
}
