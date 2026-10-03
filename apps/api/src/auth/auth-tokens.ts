import { randomBytes, timingSafeEqual } from 'node:crypto';
import { type SignedPayload, readSignedToken, signToken } from './signed-token';

export const SESSION_TTL_MS = 7 * 24 * 60 * 60_000;
export const OAUTH_STATE_TTL_MS = 10 * 60_000;

/** Who is signed in. Stateless: signing out clears the cookie, nothing server-side. */
export interface SessionPayload extends SignedPayload {
  kind: 'session';
  githubId: number;
  githubLogin: string;
}

/** The OAuth `state`: where to land after sign-in, bound to the browser by `nonce`. */
export interface OAuthStatePayload extends SignedPayload {
  kind: 'oauth';
  nonce: string;
  next: string;
}

export function createSessionToken(
  account: { githubId: number; githubLogin: string },
  secret: string,
  now = Date.now(),
): string {
  return signToken<SessionPayload>(
    { kind: 'session', githubId: account.githubId, githubLogin: account.githubLogin, issuedAt: now },
    secret,
  );
}

export function readSessionToken(token: string, secret: string, now?: number): SessionPayload {
  return readSignedToken<SessionPayload>(token, secret, 'session', SESSION_TTL_MS, now);
}

/** The nonce also goes into a short-lived cookie, so a callback only completes in the browser that started it. */
export function createOAuthState(next: string, secret: string, now = Date.now()): { state: string; nonce: string } {
  const nonce = randomBytes(16).toString('base64url');
  return { state: signToken<OAuthStatePayload>({ kind: 'oauth', nonce, next, issuedAt: now }, secret), nonce };
}

export function readOAuthState(state: string, secret: string, now?: number): OAuthStatePayload {
  return readSignedToken<OAuthStatePayload>(state, secret, 'oauth', OAUTH_STATE_TTL_MS, now);
}

export function sameNonce(a: string, b: string): boolean {
  const [x, y] = [Buffer.from(a), Buffer.from(b)];
  return x.length === y.length && timingSafeEqual(x, y);
}
