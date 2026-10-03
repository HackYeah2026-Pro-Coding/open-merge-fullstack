import { createHmac } from 'node:crypto';
import { isValidSignature } from './webhook-signature';

const SECRET = 'hook-secret';
const BODY = Buffer.from('{"action":"opened"}');
const sign = (secret: string, body: Buffer) => `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;

describe('isValidSignature', () => {
  it('accepts the signature GitHub computes over the raw body', () => {
    expect(isValidSignature(SECRET, BODY, sign(SECRET, BODY))).toBe(true);
  });

  it('rejects a signature made with another secret', () => {
    expect(isValidSignature(SECRET, BODY, sign('other', BODY))).toBe(false);
  });

  it('rejects a body that changed after signing', () => {
    expect(isValidSignature(SECRET, Buffer.from('{"action":"closed"}'), sign(SECRET, BODY))).toBe(false);
  });

  it('rejects a missing header, a wrong prefix and non-hex or short values', () => {
    expect(isValidSignature(SECRET, BODY, undefined)).toBe(false);
    expect(isValidSignature(SECRET, BODY, sign(SECRET, BODY).replace('sha256=', 'sha1='))).toBe(false);
    expect(isValidSignature(SECRET, BODY, 'sha256=not-hex')).toBe(false);
    expect(isValidSignature(SECRET, BODY, 'sha256=abcd')).toBe(false);
  });
});
