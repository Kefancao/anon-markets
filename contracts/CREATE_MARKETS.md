# Creating markets on-chain

The market IDs shown in the app (e.g. `0xd8667e22...`) are **placeholders**. They are not contract addresses and were never created on-chain. Real market IDs are only created when you call `createMarket(...)` on your deployed **PredictionMarket** contract.

Until markets are created on-chain:

- The backend has no real markets to backfill, so it serves placeholder IDs.
- Any trade (AMM or RFQ) that uses those IDs will revert with "Market does not exist", and the Unlink broadcaster will return 400 when you poll the relay.

## 1. Create markets on Monad testnet

From the `contracts/` directory, run the script. It uses **MASTER_MONAD_TOKEN_FAUCET_PRIVATE_KEY** as the deployer and the Prediction Market address from **frontend/.env.local** (or backend/.env).

**Option A – run script (recommended):**

```bash
cd contracts
# Ensure frontend/.env.local has NEXT_PUBLIC_PREDICTION_MARKET_ADDRESS and backend/.env has MASTER_MONAD_TOKEN_FAUCET_PRIVATE_KEY
./run-create-markets.sh
```

The script auto-loads `../backend/.env` and `../frontend/.env.local`, so you only need:

- **NEXT_PUBLIC_PREDICTION_MARKET_ADDRESS** – In frontend/.env.local (same as the Prediction Market contract address your app uses). Fallback: PREDICTION_MARKET_ADDRESS in backend/.env.
- **MASTER_MONAD_TOKEN_FAUCET_PRIVATE_KEY** – Used as the deployer key to send the `createMarket` transactions (set in backend/.env or root .env).

**Option B – forge directly:**

```bash
cd contracts
export DEPLOYER_PRIVATE_KEY="$MASTER_MONAD_TOKEN_FAUCET_PRIVATE_KEY"  # or set to your key
export PREDICTION_MARKET_ADDRESS=0x...   # your PredictionMarket contract address

forge script script/CreateMarkets.s.sol:CreateMarkets \
  --rpc-url https://testnet-rpc.monad.xyz \
  --broadcast
```

The script will log the **real** market IDs, for example:

```
Market 1: 0x...
Market 2: 0x...
...
Market 11: 0x...
```

Those IDs are computed by the contract as `keccak256(question, expiresAt, oracle, nonce)` and are the only ones that exist on-chain.

## 2. Restart the backend

After the script succeeds:

1. Restart the backend server.
2. On startup it runs **backfill**: it queries `MarketCreated` events from the PredictionMarket contract and fills the in-memory market list with the **real** market IDs.
3. You should see in the backend logs: `[Market] Backfilled 11 market(s) from chain`.

## 3. Refresh the frontend

The frontend loads the market list from `GET /api/markets`. After the backend has backfilled, that API returns the on-chain markets with the correct IDs. Refresh the app and trade; the 400 / "Broadcaster rejected" errors from invalid market IDs should stop.

## Note about the explorer

A **market ID** is a `bytes32` value (like `0xd8667e22...`), not a contract address. Block explorers look up addresses and transactions. Pasting a market ID into the "address" field can produce errors (e.g. NODE_REQUEST_ERROR) because it is not an account or contract address. To verify markets, call `getMarket(marketId)` on the PredictionMarket contract or check the transaction that ran `createMarket` in the explorer.
