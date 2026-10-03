import {
  OAUTH_STATE_TTL_MS,
  SESSION_TTL_MS,
  createOAuthState,
  createSessionToken,
  readOAuthState,
  readSessionToken,
  sameNonce,
} from './auth-tokens';
import { InvalidTokenError, readSignedToken, signToken } from './signed-token';

const SECRET = 's'.repeat(32);
const ACCOUNT = { githubId: 42, githubLogin: 'ada' };

describe('signed tokens', () => {
  it('round-trips the payload', () => {
    const token = signToken({ kind: 'test', issuedAt: 1000, value: 'x' }, SECRET);
    expect(readSignedToken(token, SECRET, 'test', 60_000, 2000)).toEqual({ kind: 'test', issuedAt: 1000, value: 'x' });
  });

  it('rejects a changed payload', () => {
    const [, tag] = signToken({ kind: 'test', issuedAt: 1000 }, SECRET).split('.');
    const forged = `${Buffer.from(JSON.stringify({ kind: 'test', issuedAt: 9999 })).toString('base64url')}.${tag}`;
    expect(() => readSignedToken(forged, SECRET, 'test', 60_000, 2000)).toThrow(InvalidTokenError);
  });

  it('rejects a token signed with another secret', () => {
    const token = signToken({ kind: 'test', issuedAt: 1000 }, 'o'.repeat(32));
    expect(() => readSignedToken(token, SECRET, 'test', 60_000, 2000)).toThrow(InvalidTokenError);
  });

  it('rejects malformed tokens', () => {
    for (const token of ['', 'abc', 'a.b.c']) {
      expect(() => readSignedToken(token, SECRET, 'test', 60_000)).toThrow(InvalidTokenError);
    }
  });

  it('rejects a token of another kind', () => {
    const { state } = createOAuthState('/bounties', SECRET);
    expect(() => readSessionToken(state, SECRET)).toThrow('Expected a session token.');
    expect(() => readOAuthState(createSessionToken(ACCOUNT, SECRET), SECRET)).toThrow('Expected a oauth token.');
  });

  it('expires sessions after their TTL', () => {
    const token = createSessionToken(ACCOUNT, SECRET, 0);
    expect(readSessionToken(token, SECRET, SESSION_TTL_MS).githubLogin).toBe('ada');
    expect(() => readSessionToken(token, SECRET, SESSION_TTL_MS + 1)).toThrow('Token expired.');
  });

  it('expires OAuth state after ten minutes', () => {
    const { state } = createOAuthState('/account', SECRET, 0);
    expect(readOAuthState(state, SECRET, OAUTH_STATE_TTL_MS).next).toBe('/account');
    expect(() => readOAuthState(state, SECRET, OAUTH_STATE_TTL_MS + 1)).toThrow('Token expired.');
  });

  it('binds the state to a fresh nonce', () => {
    const a = createOAuthState('/', SECRET);
    const b = createOAuthState('/', SECRET);
    expect(readOAuthState(a.state, SECRET).nonce).toBe(a.nonce);
    expect(sameNonce(a.nonce, a.nonce)).toBe(true);
    expect(sameNonce(a.nonce, b.nonce)).toBe(false);
    expect(sameNonce(a.nonce, '')).toBe(false);
  });
});
