import fetch from "node-fetch";
if (!globalThis.fetch) {
  (globalThis as Record<string, unknown>).fetch = fetch;
}

import { ethers } from "ethers";
import { createSqliteStorage, initUnlink, waitForConfirmation } from "@unlink-xyz/node";
import { config } from "../config.js";

type UnlinkInstance = Awaited<ReturnType<typeof initUnlink>>;

let faucetUnlink: UnlinkInstance | null = null;
let monadWallet: ethers.Wallet | null = null;

const cooldowns = new Map<string, number>();

export async function initFaucet(): Promise<boolean> {
  if (!config.faucet.unlinkMnemonic || !config.faucet.monadPrivateKey) {
    console.warn("[Faucet] Missing mnemonic or private key — faucet disabled");
    return false;
  }

  try {
    const provider = new ethers.JsonRpcProvider(config.monad.rpcUrl, {
      chainId: config.monad.chainId,
      name: "monad-testnet",
    });

    monadWallet = new ethers.Wallet(config.faucet.monadPrivateKey, provider);
    const monBalance = await provider.getBalance(monadWallet.address);
    console.log(
      `[Faucet] MON gas wallet: ${monadWallet.address} (${ethers.formatEther(monBalance)} MON)`
    );

    faucetUnlink = await initUnlink({
      chain: "monad-testnet",
      storage: createSqliteStorage({ path: "./data/faucet-wallet.db" }),
      setup: false,
      sync: false,
    });

    const seedExists = await faucetUnlink.seed.exists();
    if (seedExists) {
      console.log("[Faucet] Existing seed found, importing mnemonic (overwrite)");
      await faucetUnlink.seed.importMnemonic(config.faucet.unlinkMnemonic, { overwrite: true });
    } else {
      await faucetUnlink.seed.importMnemonic(config.faucet.unlinkMnemonic);
    }

    const accounts = await faucetUnlink.accounts.list();
    if (accounts.length === 0) {
      await faucetUnlink.accounts.create();
    }

    await faucetUnlink.sync();

    const balances = await faucetUnlink.getBalances();
    console.log("[Faucet] Unlink faucet balances:", balances);
    console.log(
      `[Faucet] Drip amount: ${ethers.formatUnits(config.faucet.dripAmount, 18)} tokens`
    );
    console.log(`[Faucet] Chain: monad-testnet (${config.monad.chainId})`);
    console.log("[Faucet] Ready");
    return true;
  } catch (e) {
    console.error("[Faucet] Init failed:", e);
    return false;
  }
}

export function isFaucetReady(): boolean {
  return faucetUnlink !== null && monadWallet !== null;
}

function checkCooldown(address: string): { ok: boolean; remainingMs: number } {
  const last = cooldowns.get(address.toLowerCase());
  if (!last) return { ok: true, remainingMs: 0 };
  const elapsed = Date.now() - last;
  if (elapsed >= config.faucet.cooldownMs) return { ok: true, remainingMs: 0 };
  return { ok: false, remainingMs: config.faucet.cooldownMs - elapsed };
}

export async function dripToAddress(
  recipientUnlinkAddress: string
): Promise<{ success: boolean; relayId?: string; txHash?: string; error?: string }> {
  if (!faucetUnlink || !monadWallet) {
    return { success: false, error: "Faucet not initialized" };
  }

  const cd = checkCooldown(recipientUnlinkAddress);
  if (!cd.ok) {
    const mins = Math.ceil(cd.remainingMs / 60000);
    return {
      success: false,
      error: `Cooldown active. Try again in ${mins} minute${mins !== 1 ? "s" : ""}.`,
    };
  }

  try {
    await faucetUnlink.sync();

    const dripTokenLower = config.faucet.dripToken.toLowerCase();
    const balances = await faucetUnlink.getBalances();
    const tokenKey = Object.keys(balances).find((k) => k.toLowerCase() === dripTokenLower) ?? config.faucet.dripToken;
    const available = balances[tokenKey] ?? 0n;
    if (available < config.faucet.dripAmount) {
      return {
        success: false,
        error: "Faucet balance too low. Please try again later.",
      };
    }

    const result = await faucetUnlink.send({
      transfers: [
        {
          token: tokenKey,
          recipient: recipientUnlinkAddress,
          amount: config.faucet.dripAmount,
        },
      ],
    });

    const status = await waitForConfirmation(faucetUnlink, result.relayId, {
      timeout: 120_000,
    });

    cooldowns.set(recipientUnlinkAddress.toLowerCase(), Date.now());

    console.log(
      `[Faucet] Sent ${ethers.formatUnits(config.faucet.dripAmount, 18)} to ${recipientUnlinkAddress} (tx: ${status.txHash})`
    );

    return {
      success: true,
      relayId: result.relayId,
      txHash: status.txHash,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("[Faucet] Drip failed:", msg);
    return { success: false, error: msg };
  }
}

export async function fundFaucetGas(amount: bigint): Promise<string | null> {
  if (!monadWallet || !faucetUnlink) return null;

  try {
    const burner = await faucetUnlink.burner.addressOf(0);
    const tx = await monadWallet.sendTransaction({
      to: burner.address,
      value: amount,
    });
    await tx.wait();
    console.log(
      `[Faucet] Funded gas: ${ethers.formatEther(amount)} MON → ${burner.address}`
    );
    return tx.hash;
  } catch (e) {
    console.error("[Faucet] Gas funding failed:", e);
    return null;
  }
}

export function getFaucetUnavailableReason(): string | null {
  if (isFaucetReady()) return null;
  if (!config.faucet.unlinkMnemonic)
    return "Set MASTER_UNLINK_FAUCET_MNEMONIC in backend .env to enable the faucet.";
  if (!config.faucet.monadPrivateKey)
    return "Set MASTER_MONAD_TOKEN_FAUCET_PRIVATE_KEY in backend .env to enable the faucet.";
  return "Faucet failed to initialize. Check backend logs.";
}

export function getFaucetStatus() {
  return {
    ready: isFaucetReady(),
    unavailableReason: getFaucetUnavailableReason(),
    dripAmount: config.faucet.dripAmount.toString(),
    cooldownMs: config.faucet.cooldownMs,
    gasWallet: monadWallet?.address || null,
    chain: `monad-testnet (${config.monad.chainId})`,
  };
}
