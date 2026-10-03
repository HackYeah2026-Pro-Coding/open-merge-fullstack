import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export const CHALLENGE_TTL_MS = 5 * 60_000;

/** Everything the signed message is built from. The server keeps no state. */
export interface ChallengePayload {
  /** Short random id shown in the message. */
  n: string;
  githubLogin: string;
  address: string;
  issuedAt: number;
}

export function buildMessage(p: ChallengePayload): string {
  return [
    `OpenMerge wants to link this Solana wallet to the GitHub account @${p.githubLogin}.`,
    '',
    `Wallet: ${p.address}`,
    `Nonce: ${p.n}`,
    `Issued at: ${new Date(p.issuedAt).toISOString()}`,
    '',
    'Signing is free and does not send a transaction.',
  ].join('\n');
}

function mac(body: string, secret: string): Buffer {
  return createHmac('sha256', secret).update(body).digest();
}

/**
 * The nonce is a self-contained token: payload plus HMAC. A signature is bound
 * to one account and one address and expires, so replaying a token cannot link
 * anything the wallet owner did not sign for.
 */
export function createChallengeToken(payload: Omit<ChallengePayload, 'n'>, secret: string): { token: string; payload: ChallengePayload } {
  const full: ChallengePayload = { ...payload, n: randomBytes(9).toString('base64url') };
  const body = Buffer.from(JSON.stringify(full)).toString('base64url');
  return { token: `${body}.${mac(body, secret).toString('base64url')}`, payload: full };
}

/** Returns the payload, or throws when the token is forged, malformed or expired. */
export function readChallengeToken(token: string, secret: string, now = Date.now()): ChallengePayload {
  const [body, tag, extra] = token.split('.');
  if (!body || !tag || extra !== undefined) throw new Error('Malformed challenge.');

  const given = Buffer.from(tag, 'base64url');
  const expected = mac(body, secret);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) throw new Error('Invalid challenge.');

  const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as ChallengePayload;
  if (payload.issuedAt + CHALLENGE_TTL_MS < now) throw new Error('Challenge expired.');
  return payload;
}
