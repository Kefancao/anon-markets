#!/usr/bin/env bash
# Resolve a single market by marketId (0x-prefixed hex).
# Calls PredictionMarket.resolveMarket(marketId, outcome). Broadcaster must be the market's oracle.
#
# Usage:
#   ./resolve-market.sh 0x<64 hex chars> [1|2]
#   OUTCOME: 1 = Yes (default), 2 = No

set -e
cd "$(dirname "$0")"
ROOT=".."

# Required: market id as first arg
MARKET_ID="${1:?Usage: $0 <MARKET_ID> [OUTCOME]   e.g. $0 0x1234... 1}"
OUTCOME="${2:-1}"

if [ "$OUTCOME" != "1" ] && [ "$OUTCOME" != "2" ]; then
  echo "OUTCOME must be 1 (Yes) or 2 (No)"
  exit 1
fi

# Load root .env
if [ -f "$ROOT/.env" ]; then
  set -a
  source "$ROOT/.env"
  set +a
fi
# Load backend/.env
if [ -f "$ROOT/backend/.env" ]; then
  set -a
  source "$ROOT/backend/.env"
  set +a
fi
# Load frontend/.env.local for addresses if present
if [ -f "$ROOT/frontend/.env.local" ]; then
  set -a
  source "$ROOT/frontend/.env.local"
  set +a
fi

export MARKET_ID
export OUTCOME
export PREDICTION_MARKET_ADDRESS="${NEXT_PUBLIC_PREDICTION_MARKET_ADDRESS:-$PREDICTION_MARKET_ADDRESS}"

_raw_key="${MASTER_MONAD_TOKEN_FAUCET_PRIVATE_KEY:-$DEPLOYER_PRIVATE_KEY}"
_raw_key="${_raw_key//\"/}"
if [ -n "$_raw_key" ] && [ "${_raw_key#0x}" = "$_raw_key" ]; then
  export DEPLOYER_PRIVATE_KEY="0x$_raw_key"
else
  export DEPLOYER_PRIVATE_KEY="$_raw_key"
fi
unset _raw_key

if [ -z "$DEPLOYER_PRIVATE_KEY" ] || [ -z "$PREDICTION_MARKET_ADDRESS" ]; then
  echo "Need DEPLOYER_PRIVATE_KEY (or MASTER_MONAD_TOKEN_FAUCET_PRIVATE_KEY) and PREDICTION_MARKET_ADDRESS"
  exit 1
fi

RPC="${MONAD_RPC_URL:-https://testnet-rpc.monad.xyz}"

echo "Market: $MARKET_ID"
echo "Outcome: $OUTCOME (1=Yes, 2=No)"
echo "RPC: $RPC"
echo "PredictionMarket: $PREDICTION_MARKET_ADDRESS"
echo "Running ResolveMarket..."
forge script script/ResolveMarket.s.sol:ResolveMarket \
  --rpc-url "$RPC" \
  --broadcast

echo "Done."
