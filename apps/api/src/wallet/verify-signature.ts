import { createPublicKey, verify } from 'node:crypto';
import { decodeBase58 } from './base58';

const ED25519_SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');
const PUBLIC_KEY_BYTES = 32;
const SIGNATURE_BYTES = 64;

/** A Solana address is a base58-encoded 32-byte ed25519 public key. */
export function parseSolanaAddress(address: string): Uint8Array {
  const bytes = decodeBase58(address);
  if (bytes.length !== PUBLIC_KEY_BYTES) {
    throw new Error('A Solana address decodes to 32 bytes.');
  }
  return bytes;
}

/** True when `signatureBase64` is a valid ed25519 signature of `message` by `address`. */
export function verifyWalletSignature(address: string, message: string, signatureBase64: string): boolean {
  const signature = Buffer.from(signatureBase64, 'base64');
  if (signature.length !== SIGNATURE_BYTES) return false;

  const key = createPublicKey({
    key: Buffer.concat([ED25519_SPKI_PREFIX, parseSolanaAddress(address)]),
    format: 'der',
    type: 'spki',
  });
  return verify(null, Buffer.from(message, 'utf8'), key, signature);
}
