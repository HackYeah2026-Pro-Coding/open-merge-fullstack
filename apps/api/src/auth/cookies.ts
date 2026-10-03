import type { CookieOptions, Request, Response } from 'express';
import { OAUTH_STATE_TTL_MS, SESSION_TTL_MS } from './auth-tokens';

export const SESSION_COOKIE = 'om_session';
export const OAUTH_COOKIE = 'om_oauth';

/** The OAuth nonce only travels with the sign-in routes. */
const OAUTH_COOKIE_PATH = '/api/auth/github';

/**
 * httpOnly keeps scripts away from the token; lax still sends it on the top-level
 * redirect back from GitHub but not on cross-site POSTs.
 */
function options(secure: boolean, path = '/'): CookieOptions {
  return { httpOnly: true, sameSite: 'lax', secure, path };
}

export function setSessionCookie(res: Response, token: string, secure: boolean): void {
  res.cookie(SESSION_COOKIE, token, { ...options(secure), maxAge: SESSION_TTL_MS });
}

export function clearSessionCookie(res: Response, secure: boolean): void {
  res.clearCookie(SESSION_COOKIE, options(secure));
}

export function setOAuthCookie(res: Response, nonce: string, secure: boolean): void {
  res.cookie(OAUTH_COOKIE, nonce, { ...options(secure, OAUTH_COOKIE_PATH), maxAge: OAUTH_STATE_TTL_MS });
}

export function clearOAuthCookie(res: Response, secure: boolean): void {
  res.clearCookie(OAUTH_COOKIE, options(secure, OAUTH_COOKIE_PATH));
}

/**
 * Express sets cookies but does not parse them. Values come back as sent: ours are
 * base64url, which cookie encoding leaves untouched.
 */
export function readCookie(req: Pick<Request, 'headers'>, name: string): string | undefined {
  for (const part of req.headers.cookie?.split(';') ?? []) {
    const eq = part.indexOf('=');
    if (eq !== -1 && part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim();
  }
  return undefined;
}
