import { createHmac, timingSafeEqual } from 'node:crypto';

/** Fields every signed token carries. `kind` keeps one kind of token from passing as another. */
export interface SignedPayload {
  kind: string;
  issuedAt: number;
}

/** The token was forged, malformed, of another kind or expired. */
export class InvalidTokenError extends Error {
  override name = 'InvalidTokenError';
}

function mac(body: string, secret: string): Buffer {
  return createHmac('sha256', secret).update(body).digest();
}

/**
 * Same format as the wallet challenge: base64url(JSON) "." base64url(HMAC-SHA256).
 * Anyone can read the payload but nobody can change it without the secret, so it
 * must never carry anything secret.
 */
export function signToken<T extends SignedPayload>(payload: T, secret: string): string {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${body}.${mac(body, secret).toString('base64url')}`;
}

/** Returns the payload, or throws InvalidTokenError. */
export function readSignedToken<T extends SignedPayload>(
  token: string,
  secret: string,
  kind: T['kind'],
  ttlMs: number,
  now = Date.now(),
): T {
  const [body, tag, extra] = token.split('.');
  if (!body || !tag || extra !== undefined) throw new InvalidTokenError('Malformed token.');

  const given = Buffer.from(tag, 'base64url');
  const expected = mac(body, secret);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    throw new InvalidTokenError('Invalid token signature.');
  }

  const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as T;
  if (payload.kind !== kind) throw new InvalidTokenError(`Expected a ${kind} token.`);
  if (typeof payload.issuedAt !== 'number' || payload.issuedAt + ttlMs < now) {
    throw new InvalidTokenError('Token expired.');
  }
  return payload;
}
