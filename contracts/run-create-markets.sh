#!/usr/bin/env bash
# Create demo markets on-chain (Monad testnet).
# Uses MASTER_MONAD_TOKEN_FAUCET_PRIVATE_KEY as deployer and Prediction Market address from frontend/.env.local or backend/.env.

set -e
cd "$(dirname "$0")"
ROOT=".."

# Load root .env first (often has MASTER_MONAD_TOKEN_FAUCET_PRIVATE_KEY)
if [ -f "$ROOT/.env" ]; then
  set -a
  source "$ROOT/.env"
  set +a
fi

# Load backend/.env if present
if [ -f "$ROOT/backend/.env" ]; then
  set -a
  source "$ROOT/backend/.env"
  set +a
fi

# Load frontend/.env.local if present (has NEXT_PUBLIC_PREDICTION_MARKET_ADDRESS)
if [ -f "$ROOT/frontend/.env.local" ]; then
  set -a
  source "$ROOT/frontend/.env.local"
  set +a
fi

# Prediction Market address: prefer frontend env, then backend
export PREDICTION_MARKET_ADDRESS="${NEXT_PUBLIC_PREDICTION_MARKET_ADDRESS:-$PREDICTION_MARKET_ADDRESS}"

# Deployer key: use faucet key (forge script expects DEPLOYER_PRIVATE_KEY with 0x prefix)
_raw_key="${MASTER_MONAD_TOKEN_FAUCET_PRIVATE_KEY:-$DEPLOYER_PRIVATE_KEY}"
_raw_key="${_raw_key//\"/}"  # strip quotes
if [ -n "$_raw_key" ] && [ "${_raw_key#0x}" = "$_raw_key" ]; then
  export DEPLOYER_PRIVATE_KEY="0x$_raw_key"
else
  export DEPLOYER_PRIVATE_KEY="$_raw_key"
fi
unset _raw_key

if [ -z "$DEPLOYER_PRIVATE_KEY" ] || [ -z "$PREDICTION_MARKET_ADDRESS" ]; then
  echo "Need: MASTER_MONAD_TOKEN_FAUCET_PRIVATE_KEY and Prediction Market address"
  echo "  - Prediction Market: set NEXT_PUBLIC_PREDICTION_MARKET_ADDRESS in frontend/.env.local (or PREDICTION_MARKET_ADDRESS in backend/.env)"
  echo "  - Deployer key: set MASTER_MONAD_TOKEN_FAUCET_PRIVATE_KEY in backend/.env or root .env"
  exit 1
fi

RPC="${MONAD_RPC_URL:-https://testnet-rpc.monad.xyz}"

echo "Using RPC: $RPC"
echo "PredictionMarket: $PREDICTION_MARKET_ADDRESS"
echo "Running CreateMarkets..."
forge script script/CreateMarkets.s.sol:CreateMarkets \
  --rpc-url "$RPC" \
  --broadcast

echo ""
echo "Done. Restart the backend so it backfills these market IDs, then refresh the frontend."
