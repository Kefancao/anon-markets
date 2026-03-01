# Scripts

## test-unlink-mint.mjs

Tests the Unlink adapter flow for `mintShares`: unshield → transfer(collateral to PredictionMarket) → mintShares.

**Run (do not commit your mnemonic):**

```bash
# From frontend directory
UNLINK_MNEMONIC="your 12 or 24 word phrase" npm run test:unlink-mint
```

Optional env: `COLLATERAL_TOKEN`, `PREDICTION_MARKET`, `MARKET_ID` (defaults match Monad testnet and the first demo market).

**What it does:** Imports the wallet from the mnemonic, syncs notes, then calls `interact()` with a small spend (0.01 tokens) and the same two calls used in the UI (transfer + mintShares). It prints the relay ID and polls status until the relay succeeds or fails.

If the relay is submitted but then fails with **execution reverted** and revert data starting with `0x53429df3...`, the failure is **on-chain** during the broadcaster’s simulation (e.g. Unlink pool/adapter revert). The 400 you see in the browser when polling the batch endpoint is a consequence of that: the relay is dropped or marked dead, so the batch API returns an error for that ID.
