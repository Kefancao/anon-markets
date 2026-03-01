/**
 * Test script: Unlink adapter interact for mintShares.
 *
 * Run from frontend directory:
 *   UNLINK_MNEMONIC="your twelve or twenty four word mnemonic" node scripts/test-unlink-mint.mjs
 *
 * Or: npm run test:unlink-mint  (with UNLINK_MNEMONIC in env)
 *
 * Optionally set: COLLATERAL_TOKEN, PREDICTION_MARKET, MARKET_ID
 *
 * Uses monad-testnet, in-memory storage, and a tiny mint (0.01 tokens) to verify
 * the flow: unshield -> transfer -> mintShares.
 *
 * If the relay is accepted but then fails with "execution reverted" and data
 * like 0x53429df3..., the failure is on-chain (broadcaster simulation).
 * That usually means the Unlink pool/adapter reverted (e.g. insufficient
 * pool balance for the unshield). Share the full revert data with Unlink.
 */

import { Unlink, createMemoryStorage, buildCall } from "@unlink-xyz/core";
import { randomFillSync } from "crypto";

const COLLATERAL_TOKEN =
  process.env.NEXT_PUBLIC_COLLATERAL_TOKEN_ADDRESS ||
  process.env.COLLATERAL_TOKEN ||
  "0xaaa4e95d4da878baf8e10745fdf26e196918df6b";
const PREDICTION_MARKET =
  process.env.NEXT_PUBLIC_PREDICTION_MARKET_ADDRESS ||
  process.env.PREDICTION_MARKET ||
  "0x482d224436c9D3794A0f9AbF6396c90a681462C2";
const MARKET_ID =
  process.env.MARKET_ID ||
  "0xe4aab3eb4ca349ebd647ad869f50bd01f1d841636c65e9c8249907ed0687c01e";

const COST_WEI = BigInt(1e16); // 0.01 * 1e18
// Adapter requires gain > 0 for reshield, so unshield 1 wei extra.
const SPEND_WEI = COST_WEI + 1n;
const SHARES_WEI = BigInt(1e16);
const IS_YES = true;

function log(msg, data = null) {
  const ts = new Date().toISOString();
  if (data !== null) console.log(ts, msg, typeof data === "object" ? JSON.stringify(data, (_, v) => (typeof v === "bigint" ? v.toString() : v)) : data);
  else console.log(ts, msg);
}

async function main() {
  const mnemonic = process.env.UNLINK_MNEMONIC?.trim();
  if (!mnemonic) {
    console.error("Set UNLINK_MNEMONIC (your Unlink wallet mnemonic). Do not commit it.");
    process.exit(1);
  }

  log("Config", {
    COLLATERAL_TOKEN,
    PREDICTION_MARKET,
    MARKET_ID: MARKET_ID.slice(0, 18) + "...",
    COST_WEI: COST_WEI.toString(),
    SHARES_WEI: SHARES_WEI.toString(),
    IS_YES,
  });

  const storage = createMemoryStorage();
  await storage.open();

  log("Creating Unlink (monad-testnet)...");
  const unlink = await Unlink.create({
    chain: "monad-testnet",
    storage,
    rng: (n) => {
      const arr = new Uint8Array(n);
      if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(arr);
      else randomFillSync(arr);
      return arr;
    },
    fetch: globalThis.fetch,
    autoSync: false,
  });

  log("Importing wallet from mnemonic...");
  await unlink.seed.importMnemonic(mnemonic);

  const accounts = await unlink.accounts.list();
  if (accounts.length === 0) {
    log("No account found, creating one...");
    await unlink.accounts.create();
  } else {
    log("Accounts", accounts.length);
  }

  const collateralLower = COLLATERAL_TOKEN.toLowerCase();
  const transferCall = buildCall({
    to: COLLATERAL_TOKEN,
    abi: "function transfer(address to, uint256 amount) returns (bool)",
    functionName: "transfer",
    args: [PREDICTION_MARKET, COST_WEI],
  });
  const mintCall = buildCall({
    to: PREDICTION_MARKET,
    abi: "function mintShares(bytes32 marketId, address recipient, bool isYes, uint256 shares, uint256 cost)",
    functionName: "mintShares",
    args: [
      MARKET_ID,
      unlink.adapter.address,
      IS_YES,
      SHARES_WEI,
      COST_WEI,
    ],
  });

  log("Adapter address", unlink.adapter.address);
  log("Syncing notes (required for spend)...");
  await unlink.sync();

  const balance = await unlink.getBalance(collateralLower);
  log("Shielded balance (collateral)", balance.toString());
  if (balance < COST_WEI) {
    console.error("Insufficient shielded balance. Deposit first or reduce COST_WEI.");
    process.exit(1);
  }

  log("Calling interact (unshield -> transfer -> mintShares)...");
  let result;
  try {
    result = await unlink.interact(
      {
        spend: [{ token: collateralLower, amount: SPEND_WEI }],
        calls: [transferCall, mintCall],
        receive: [{ token: collateralLower, minAmount: 0n }],
      },
      { skipBroadcast: false }
    );
  } catch (err) {
    log("interact error", err.message || String(err));
    if (err.response) log("response", { status: err.response?.status, body: err.response?.body });
    throw err;
  }

  log("Relay submitted", { relayId: result.relayId });

  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const status = await unlink.getTxStatus(result.relayId);
    log("Poll status", { state: status.state, txHash: status.txHash || null, error: status.error || null });
    if (status.state === "succeeded") {
      log("Success. Tx hash:", status.txHash);
      return;
    }
    if (["reverted", "failed", "dead"].includes(status.state)) {
      console.error("Relay failed", status.error || status.state);
      process.exit(1);
    }
  }

  console.error("Timeout waiting for relay");
  process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
