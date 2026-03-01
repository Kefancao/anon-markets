import dotenv from "dotenv";
import path from "path";

dotenv.config();
dotenv.config({ path: path.resolve(process.cwd(), "../.env"), override: false });

export const config = {
  port: parseInt(process.env.PORT || "3001", 10),
  monad: {
    rpcUrl: process.env.MONAD_RPC_URL || "https://testnet-rpc.monad.xyz",
    chainId: parseInt(process.env.MONAD_CHAIN_ID || "10143", 10),
  },
  contracts: {
    predictionMarket: process.env.PREDICTION_MARKET_ADDRESS || "",
    rfqEngine: process.env.RFQ_ENGINE_ADDRESS || "",
    parlayEngine: process.env.PARLAY_ENGINE_ADDRESS || "",
    yieldVault: process.env.YIELD_VAULT_ADDRESS || "",
    collateralToken: process.env.COLLATERAL_TOKEN_ADDRESS || "",
  },
  parlayMaker: {
    privateKey: process.env.MASTER_MONAD_TOKEN_FAUCET_PRIVATE_KEY || "",
  },
  unlink: {
    chain: (process.env.UNLINK_CHAIN || "monad-testnet") as "monad-testnet",
    gatewayUrl: process.env.UNLINK_GATEWAY_URL || "https://api.unlink.xyz",
    poolAddress:
      process.env.UNLINK_POOL_ADDRESS ||
      "0x0813da0a10328e5ed617d37e514ac2f6fa49a254",
  },
  faucet: {
    unlinkMnemonic: process.env.MASTER_UNLINK_FAUCET_MNEMONIC || "",
    monadPrivateKey: process.env.MASTER_MONAD_TOKEN_FAUCET_PRIVATE_KEY || "",
    dripToken: process.env.FAUCET_DRIP_TOKEN || "0xaaa4e95d4da878baf8e10745fdf26e196918df6b",
    dripAmount: BigInt(process.env.FAUCET_DRIP_AMOUNT || "100000000000000000000"),
    cooldownMs: parseInt(process.env.FAUCET_COOLDOWN_MS || "3600000", 10),
  },
} as const;
