import { ethers } from "ethers";
import { config } from "../config.js";
import {
  PredictionMarketABI,
  RFQEngineABI,
  ParlayEngineABI,
  YieldVaultABI,
} from "../abis.js";

let provider: ethers.JsonRpcProvider;

export function getProvider(): ethers.JsonRpcProvider {
  if (!provider) {
    provider = new ethers.JsonRpcProvider(config.monad.rpcUrl, {
      chainId: config.monad.chainId,
      name: "monad",
    });
  }
  return provider;
}

function isValidAddress(addr: string): boolean {
  return Boolean(addr && addr.startsWith("0x") && addr.length === 42);
}

export function getPredictionMarketContract(): ethers.Contract | null {
  if (!isValidAddress(config.contracts.predictionMarket)) return null;
  return new ethers.Contract(
    config.contracts.predictionMarket,
    PredictionMarketABI,
    getProvider()
  );
}

export function getRFQEngineContract(): ethers.Contract | null {
  if (!isValidAddress(config.contracts.rfqEngine)) return null;
  return new ethers.Contract(
    config.contracts.rfqEngine,
    RFQEngineABI,
    getProvider()
  );
}

export function getParlayEngineContract(): ethers.Contract | null {
  if (!isValidAddress(config.contracts.parlayEngine)) return null;
  return new ethers.Contract(
    config.contracts.parlayEngine,
    ParlayEngineABI,
    getProvider()
  );
}

export function getParlayEngineWithSigner(): ethers.Contract | null {
  if (!isValidAddress(config.contracts.parlayEngine)) return null;
  if (!config.parlayMaker.privateKey) return null;
  const wallet = new ethers.Wallet(config.parlayMaker.privateKey, getProvider());
  return new ethers.Contract(
    config.contracts.parlayEngine,
    ParlayEngineABI,
    wallet
  );
}

export function getYieldVaultContract(): ethers.Contract | null {
  if (!isValidAddress(config.contracts.yieldVault)) return null;
  return new ethers.Contract(
    config.contracts.yieldVault,
    YieldVaultABI,
    getProvider()
  );
}
