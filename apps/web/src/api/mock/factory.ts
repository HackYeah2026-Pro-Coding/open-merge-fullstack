import type { BountyEvent } from '@escrow/shared';

const BASE58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

function randomString(alphabet: string, length: number): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
}

/** Plausible-looking identifiers for data that would come from GitHub or Solana. */
export const fake = {
  sha: () => randomString('0123456789abcdef', 40),
  txSignature: () => randomString(BASE58, 88),
  address: () => randomString(BASE58, 44),
  id: () => randomString('abcdefghijklmnopqrstuvwxyz0123456789', 20),
  nonce: () => randomString(BASE58, 24),
};

export function event(type: BountyEvent['type'], at: string, extra: Partial<BountyEvent> = {}): BountyEvent {
  return { type, at, actor: null, prNumber: null, commitSha: null, txSignature: null, note: null, ...extra };
}
