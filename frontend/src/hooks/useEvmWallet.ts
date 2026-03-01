"use client";

import { useState, useCallback, useEffect, useRef } from "react";

interface EvmWalletState {
  address: string | null;
  chainId: number | null;
  connected: boolean;
  connecting: boolean;
  signing: boolean;
  signature: string | null;
  error: string | null;
}

const MONAD_CHAIN_ID = 10143;
const MONAD_RPC = "https://testnet-rpc.monad.xyz";
const AUTH_MESSAGE = "Sign in to Anon Market Private Prediction Markets\n\nThis signature verifies your identity. It does not authorize any transaction.";

function getEthereum(): (typeof window)["ethereum"] | null {
  if (typeof window === "undefined") return null;
  return (window as unknown as { ethereum?: typeof window.ethereum }).ethereum ?? null;
}

const EVM_DISCONNECTED_KEY = "anon_market_evm_disconnected";

export function useEvmWallet() {
  const [state, setState] = useState<EvmWalletState>({
    address: null,
    chainId: null,
    connected: false,
    connecting: false,
    signing: false,
    signature: null,
    error: null,
  });
  const userDisconnectedRef = useRef(
    typeof sessionStorage !== "undefined" && sessionStorage.getItem(EVM_DISCONNECTED_KEY) === "1"
  );

  useEffect(() => {
    const eth = getEthereum();
    if (!eth) return;
    if (typeof sessionStorage !== "undefined" && sessionStorage.getItem(EVM_DISCONNECTED_KEY) === "1") {
      userDisconnectedRef.current = true;
    }

    const handleAccountsChanged = (...args: unknown[]) => {
      if (userDisconnectedRef.current) return;
      const accounts = args[0] as string[];
      if (!accounts || accounts.length === 0) {
        setState((s) => ({
          ...s,
          address: null,
          connected: false,
          signature: null,
        }));
      } else {
        setState((s) => ({ ...s, address: accounts[0], connected: true }));
      }
    };

    const handleChainChanged = (...args: unknown[]) => {
      const chainIdHex = args[0] as string;
      setState((s) => ({ ...s, chainId: parseInt(chainIdHex, 16) }));
    };

    eth.on?.("accountsChanged", handleAccountsChanged);
    eth.on?.("chainChanged", handleChainChanged);

    const skipRestore =
      typeof sessionStorage !== "undefined" && sessionStorage.getItem(EVM_DISCONNECTED_KEY) === "1";
    if (!skipRestore) {
      eth.request?.({ method: "eth_accounts" }).then((result: unknown) => {
        if (userDisconnectedRef.current) return;
        if (typeof sessionStorage !== "undefined" && sessionStorage.getItem(EVM_DISCONNECTED_KEY) === "1") return;
        const accounts = result as string[];
        if (accounts && accounts.length > 0) {
          setState((s) => ({ ...s, address: accounts[0], connected: true }));
        }
      });
    }

    eth.request?.({ method: "eth_chainId" }).then((result: unknown) => {
      const chainIdHex = result as string;
      setState((s) => ({ ...s, chainId: parseInt(chainIdHex, 16) }));
    });

    return () => {
      eth.removeListener?.("accountsChanged", handleAccountsChanged);
      eth.removeListener?.("chainChanged", handleChainChanged);
    };
  }, []);

  const connect = useCallback(async () => {
    userDisconnectedRef.current = false;
    if (typeof sessionStorage !== "undefined") sessionStorage.removeItem(EVM_DISCONNECTED_KEY);
    const eth = getEthereum();
    if (!eth) {
      setState((s) => ({ ...s, error: "No wallet detected. Install MetaMask or another EVM wallet." }));
      return;
    }

    setState((s) => ({ ...s, connecting: true, error: null }));
    try {
      const accounts = (await eth.request({
        method: "eth_requestAccounts",
      })) as string[];
      const chainIdHex = (await eth.request({ method: "eth_chainId" })) as string;
      setState((s) => ({
        ...s,
        address: accounts[0],
        chainId: parseInt(chainIdHex, 16),
        connected: true,
        connecting: false,
      }));
    } catch (e) {
      setState((s) => ({
        ...s,
        connecting: false,
        error: e instanceof Error ? e.message : "Connection rejected",
      }));
    }
  }, []);

  const signIdentity = useCallback(async () => {
    const eth = getEthereum();
    if (!eth || !state.address) return null;

    setState((s) => ({ ...s, signing: true, error: null }));
    try {
      // Fixed message (no nonce/timestamp) so the same wallet always produces the same signature.
      // That allows deriving a deterministic Unlink address from this signature.
      const message = `${AUTH_MESSAGE}\n\nEVM address: ${state.address}`;

      const signature = (await eth.request({
        method: "personal_sign",
        params: [message, state.address],
      })) as string;

      setState((s) => ({ ...s, signing: false, signature }));
      return { signature, message, address: state.address };
    } catch (e) {
      setState((s) => ({
        ...s,
        signing: false,
        error: e instanceof Error ? e.message : "Signature rejected",
      }));
      return null;
    }
  }, [state.address]);

  const switchToMonad = useCallback(async () => {
    const eth = getEthereum();
    if (!eth) return;

    try {
      await eth.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: `0x${MONAD_CHAIN_ID.toString(16)}` }],
      });
    } catch (switchError: unknown) {
      const err = switchError as { code?: number };
      if (err.code === 4902) {
        await eth.request({
          method: "wallet_addEthereumChain",
          params: [
            {
              chainId: `0x${MONAD_CHAIN_ID.toString(16)}`,
              chainName: "Monad Testnet",
              nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
              rpcUrls: [MONAD_RPC],
              blockExplorerUrls: ["https://testnet.monadvision.com"],
            },
          ],
        });
      }
    }
  }, []);

  const disconnect = useCallback(async () => {
    userDisconnectedRef.current = true;
    if (typeof sessionStorage !== "undefined") sessionStorage.setItem(EVM_DISCONNECTED_KEY, "1");
    setState({
      address: null,
      chainId: null,
      connected: false,
      connecting: false,
      signing: false,
      signature: null,
      error: null,
    });

    // Revoke MetaMask's permission so eth_accounts returns [] until user re-connects
    const eth = getEthereum();
    if (eth) {
      try {
        await eth.request({
          method: "wallet_revokePermissions",
          params: [{ eth_accounts: {} }],
        });
      } catch {
        // Not all wallets support wallet_revokePermissions; the sessionStorage guard handles those
      }
    }
  }, []);

  const clearError = useCallback(() => {
    setState((s) => ({ ...s, error: null }));
  }, []);

  return {
    ...state,
    isMonad: state.chainId === MONAD_CHAIN_ID,
    hasWallet: typeof window !== "undefined" && !!getEthereum(),
    shortAddress: state.address
      ? `${state.address.slice(0, 6)}...${state.address.slice(-4)}`
      : "",
    connect,
    signIdentity,
    switchToMonad,
    disconnect,
    clearError,
  };
}
