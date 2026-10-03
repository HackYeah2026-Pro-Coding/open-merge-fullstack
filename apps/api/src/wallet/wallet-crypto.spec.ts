import { decodeBase58 } from './base58';
import { CHALLENGE_TTL_MS, buildMessage, createChallengeToken, readChallengeToken } from './challenge';
import { createTestWallet, encodeBase58 } from './test-keys';
import { parseSolanaAddress, verifyWalletSignature } from './verify-signature';

const SECRET = 'x'.repeat(32);

describe('base58', () => {
  it('round-trips bytes including leading zeros', () => {
    const bytes = Uint8Array.from([0, 0, 1, 2, 255, 128]);
    expect(Array.from(decodeBase58(encodeBase58(bytes)))).toEqual(Array.from(bytes));
  });

  it('rejects characters outside the alphabet', () => {
    expect(() => decodeBase58('0OIl')).toThrow('Invalid base58');
  });
});

describe('wallet signature', () => {
  it('accepts a signature made by the address key', () => {
    const wallet = createTestWallet();
    expect(verifyWalletSignature(wallet.address, 'hello', wallet.signMessage('hello'))).toBe(true);
  });

  it('rejects a signature for a different message', () => {
    const wallet = createTestWallet();
    expect(verifyWalletSignature(wallet.address, 'other', wallet.signMessage('hello'))).toBe(false);
  });

  it('rejects a signature from another wallet', () => {
    const [a, b] = [createTestWallet(), createTestWallet()];
    expect(verifyWalletSignature(a.address, 'hello', b.signMessage('hello'))).toBe(false);
  });

  it('rejects a signature of the wrong length', () => {
    const wallet = createTestWallet();
    expect(verifyWalletSignature(wallet.address, 'hello', 'AAAA')).toBe(false);
  });

  it('rejects an address that is not 32 bytes', () => {
    expect(() => parseSolanaAddress('abc')).toThrow('32 bytes');
  });
});

describe('challenge token', () => {
  const base = { githubLogin: 'ada', address: 'addr', issuedAt: 1_000_000 };

  it('reads back what was issued and builds a stable message', () => {
    const { token, payload } = createChallengeToken(base, SECRET);
    const read = readChallengeToken(token, SECRET, base.issuedAt + 1);
    expect(read).toEqual(payload);
    expect(buildMessage(read)).toBe(buildMessage(payload));
    expect(buildMessage(read)).toContain('@ada');
  });

  it('rejects a tampered payload', () => {
    const { token } = createChallengeToken(base, SECRET);
    const [body, tag] = token.split('.');
    const forged = Buffer.from(JSON.stringify({ ...base, githubLogin: 'eve', n: 'x' })).toString('base64url');
    expect(body).not.toBe(forged);
    expect(() => readChallengeToken(`${forged}.${tag}`, SECRET, base.issuedAt)).toThrow('Invalid challenge');
  });

  it('rejects a token signed with another secret', () => {
    const { token } = createChallengeToken(base, SECRET);
    expect(() => readChallengeToken(token, 'y'.repeat(32), base.issuedAt)).toThrow('Invalid challenge');
  });

  it('rejects an expired token', () => {
    const { token } = createChallengeToken(base, SECRET);
    expect(() => readChallengeToken(token, SECRET, base.issuedAt + CHALLENGE_TTL_MS + 1)).toThrow('expired');
  });

  it('rejects a malformed token', () => {
    expect(() => readChallengeToken('nope', SECRET)).toThrow('Malformed');
  });
});
