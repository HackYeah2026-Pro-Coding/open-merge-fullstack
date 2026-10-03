import { Keypair, PublicKey } from '@solana/web3.js';

/**
 * Reads a keypair stored as base64 of a solana-keygen JSON file: 64 numbers, the
 * secret key followed by its public key. Errors name the variable, never the value.
 */
export function keypairFromBase64(name: string, value: string): Keypair {
  let bytes: unknown;
  try {
    bytes = JSON.parse(Buffer.from(value, 'base64').toString('utf8'));
  } catch {
    // The parser's message quotes the input, which here is a secret, so it is dropped.
    throw new Error(`${name}: not base64 of a solana-keygen JSON file`);
  }
  if (!Array.isArray(bytes) || bytes.length !== 64 || !bytes.every((b) => Number.isInteger(b) && b >= 0 && b <= 255)) {
    throw new Error(`${name}: expected a JSON array of 64 bytes`);
  }
  try {
    // Checks that the public half belongs to the secret half.
    return Keypair.fromSecretKey(Uint8Array.from(bytes));
  } catch {
    throw new Error(`${name}: the public key does not match the secret key`);
  }
}

/** Parses a base58 Solana address, naming the variable when it is not one. */
export function publicKeyFrom(name: string, value: string): PublicKey {
  try {
    return new PublicKey(value);
  } catch {
    throw new Error(`${name}: not a valid Solana address`);
  }
}
