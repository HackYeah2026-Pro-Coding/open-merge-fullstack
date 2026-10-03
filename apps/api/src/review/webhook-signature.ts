import { createHmac, timingSafeEqual } from 'node:crypto';

const PREFIX = 'sha256=';

/**
 * Checks GitHub's `X-Hub-Signature-256` header against the raw request body.
 * The comparison runs on equal-length buffers in constant time.
 */
export function isValidSignature(secret: string, rawBody: Buffer, header: string | undefined): boolean {
  if (!header?.startsWith(PREFIX)) return false;
  const expected = createHmac('sha256', secret).update(rawBody).digest();
  const received = Buffer.from(header.slice(PREFIX.length), 'hex');
  return received.length === expected.length && timingSafeEqual(received, expected);
}
