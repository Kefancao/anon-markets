/**
 * Derive a deterministic BIP39 mnemonic from an EVM identity signature.
 * Same (address, message) → same signature → same mnemonic → same Unlink address.
 */

import { entropyToMnemonic } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english";

/**
 * Hash hex string to 32 bytes (SHA-256) for use as BIP39 entropy.
 */
async function sha256Hex(hex: string): Promise<Uint8Array> {
  const raw = hex.startsWith("0x") ? hex.slice(2) : hex;
  const bytes = new Uint8Array(raw.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(raw.slice(i * 2, i * 2 + 2), 16);
  }
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return new Uint8Array(hash);
}

/**
 * Derive a 24-word BIP39 mnemonic from an identity signature.
 * Use this mnemonic with Unlink's importWallet() so the same EVM sign-in yields the same Unlink address.
 */
export async function deriveMnemonicFromSignature(signature: string): Promise<string> {
  const entropy = await sha256Hex(signature);
  return entropyToMnemonic(entropy, wordlist);
}
