/**
 * Phantom injects a provider at window.phantom.solana. No SDK is needed to
 * connect and sign a message; transactions are the escrow side's concern.
 */

interface PublicKeyLike {
  toString(): string;
}

export interface PhantomProvider {
  isPhantom?: boolean;
  publicKey: PublicKeyLike | null;
  connect(options?: { onlyIfTrusted?: boolean }): Promise<{ publicKey: PublicKeyLike }>;
  disconnect(): Promise<void>;
  signMessage(message: Uint8Array, display?: 'utf8' | 'hex'): Promise<{ signature: Uint8Array; publicKey: PublicKeyLike }>;
}

declare global {
  interface Window {
    phantom?: { solana?: PhantomProvider };
  }
}

export const PHANTOM_DOWNLOAD_URL = 'https://phantom.com/download';

export function getPhantom(): PhantomProvider | null {
  const provider = window.phantom?.solana;
  return provider?.isPhantom ? provider : null;
}

/** Phantom rejects with code 4001 when the person dismisses the prompt. */
export function isUserRejection(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code: unknown }).code === 4001;
}

export function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}
