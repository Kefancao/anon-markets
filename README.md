# Anon Market — Private Prediction Markets

Private prediction markets on **Monad** with **Unlink** privacy. Trade binary outcomes with hidden balances, private collateral, and confidential settlement.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Frontend (Next.js)                   │
│   Polymarket-style UI · Monad dark theme · Unlink React SDK │
└────────────────────────────┬────────────────────────────────┘
                             │ REST + WebSocket
┌────────────────────────────▼────────────────────────────────┐
│                     Backend (Node.js/Express)                │
│   Market data · RFQ engine · Global stats · Event indexer   │
└────────────────────────────┬────────────────────────────────┘
                             │ ethers.js / Unlink Node SDK
┌────────────────────────────▼────────────────────────────────┐
│                   Monad Blockchain (Chain ID 143)            │
│                                                              │
│  ┌──────────────┐  ┌───────────┐  ┌──────────────────────┐ │
│  │ Prediction   │  │ RFQ       │  │ Parlay    │ Yield    │ │
│  │ Market       │◄─┤ Engine    │  │ Engine    │ Vault    │ │
│  └──────────────┘  └───────────┘  └──────────────────────┘ │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │              Unlink Privacy Pool                      │   │
│  │   Private collateral · Private settlement · DeFi      │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

## Features

| Feature | Description |
|---|---|
| **RFQ System** | Takers request quotes, makers respond with prices. Fill atomically on-chain. |
| **Parlay Bets** | Bundle 2-12 market legs into one all-or-nothing bet with a single RFQ. |
| **Stablecoin Yield** | Idle stablecoins auto-earn yield via Unlink's private DeFi adapter. |
| **Private Collateral** | Deposits, positions, and balances stay hidden via Unlink's ZK privacy pool. |
| **Private Settlement** | Fills and redemptions settle through Unlink's adapter — no exposed addresses. |
| **Maker Hedging** | Makers hedge privately using Unlink burner accounts (derived EOAs). |
| **Public Analytics** | Market prices, volume, RFQ stats, acceptance rates are publicly visible. |

## What's Private vs Public

| Data | Visibility |
|---|---|
| Balances | Private (Unlink) |
| Transaction history | Private (Unlink) |
| Collateral positions | Private (Unlink) |
| Maker hedge activity | Private (burner accounts) |
| Market prices | Public |
| Volume / RFQ count | Public |
| Maker response latency | Public |
| Quote-to-fill ratio | Public |

## Project Structure

```
├── contracts/           Solidity smart contracts (Foundry)
│   └── src/
│       ├── PredictionMarket.sol   Binary outcome markets
│       ├── RFQEngine.sol          Request-for-quote matching
│       ├── ParlayEngine.sol       Multi-leg parlay system
│       ├── YieldVault.sol         Stablecoin yield vault
│       └── interfaces/            Contract interfaces
├── backend/             Node.js backend server
│   └── src/
│       ├── index.ts               Express + WebSocket server
│       ├── services/chain.ts      Monad chain interaction
│       ├── services/rfq.ts        RFQ state + event indexing
│       ├── services/markets.ts    Market data + caching
│       ├── services/websocket.ts  Real-time client updates
│       └── routes/                REST API endpoints
└── frontend/            Next.js frontend
    └── src/
        ├── app/                   Next.js app router pages
        ├── components/            UI components
        ├── hooks/
        │   ├── usePrivateRFQ.ts   Private RFQ via Unlink adapter
        │   ├── usePrivateYield.ts Private yield via Unlink adapter
        │   ├── useDemoData.ts     Demo data for development
        │   └── useWebSocket.ts    Real-time backend connection
        ├── lib/                   Utilities (API, formatting)
        └── types/                 TypeScript types
```

## Prerequisites

- Node.js >= 20
- [Foundry](https://book.getfoundry.sh/) (for smart contracts)
- npm or pnpm

## Quick Start

### 1. Install dependencies

```bash
# Backend
cd backend && npm install

# Frontend
cd frontend && npm install
```

### 2. Configure environment

```bash
# Backend
cp backend/.env.example backend/.env
# Edit backend/.env with your contract addresses after deployment

# Frontend
# frontend/.env.local is pre-configured for local dev
```

### 3. Deploy contracts (Monad)

```bash
cd contracts
forge build
forge script script/Deploy.s.sol --rpc-url https://rpc.monad.xyz --broadcast
```

Update contract addresses in `backend/.env` and `frontend/.env.local`.

### 4. Run the app

```bash
# Terminal 1: Backend
cd backend && npm run dev

# Terminal 2: Frontend
cd frontend && npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Privacy Flow

### Taker places an RFQ (private)

```
User → Unlink SDK → ZK Proof → Unlink Adapter → RFQ Engine → PredictionMarket
         ↑                         ↑
     Private wallet         Atomic: unshield → approve → call → reshield
```

1. User calls `usePrivateRFQ().requestQuotePrivately()`
2. Unlink SDK generates a ZK proof for the unshield
3. Adapter atomically: unshields collateral → approves RFQ contract → calls `requestQuote()` → reshields change
4. On-chain, only the adapter address is visible — taker identity is hidden

### Maker hedges (private via burner)

```
Unlink Pool → Withdraw to Burner EOA → DEX Swap → Sweep back to Pool
     ↑              ↑                       ↑              ↑
  Private       Ephemeral EOA         Standard tx      Re-shielded
```

1. Maker calls `usePrivateRFQ().hedgePrivately()`
2. Funds are withdrawn from pool to a BIP-44 derived burner EOA
3. Burner executes hedge trade on any DEX (standard EOA transaction)
4. Remaining tokens are swept back to the privacy pool

### Stablecoin yield (private via adapter)

```
Unlink Pool → Adapter → YieldVault.deposit() → Reshield receipt
```

Uses `unlink.interact()` to atomically unshield, deposit into YieldVault, and reshield — tokens are never exposed.

## Smart Contract Addresses

| Contract | Address |
|---|---|
| PredictionMarket | Deploy to Monad |
| RFQEngine | Deploy to Monad |
| ParlayEngine | Deploy to Monad |
| YieldVault | Deploy to Monad |
| Unlink Pool (testnet) | `0x0813da0a10328e5ed617d37e514ac2f6fa49a254` |

## Tech Stack

- **Blockchain**: Monad (Chain ID 143, 10k TPS, 400ms blocks)
- **Privacy**: Unlink (ZK privacy pool, adapter pattern, burner accounts)
- **Contracts**: Solidity 0.8.24, Foundry
- **Backend**: Node.js, Express, WebSocket, ethers.js, @unlink-xyz/node
- **Frontend**: Next.js 16, Tailwind CSS, @unlink-xyz/react, lucide-react

## API Endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/api/markets` | All markets |
| GET | `/api/markets/:id` | Single market |
| GET | `/api/rfq/active` | Active RFQ requests |
| GET | `/api/rfq/fills?limit=50` | Recent fills |
| GET | `/api/rfq/stats` | Global RFQ stats |
| GET | `/api/rfq/maker/:address` | Maker performance stats |
| GET | `/api/health` | Health check |
| WS | `/ws` | Real-time market + RFQ updates |

## License

MIT
