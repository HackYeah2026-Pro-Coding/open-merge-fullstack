import type { Response } from 'express';
import { SESSION_TTL_MS } from './auth-tokens';
import { OAUTH_COOKIE, SESSION_COOKIE, clearOAuthCookie, readCookie, setSessionCookie } from './cookies';
import { DEFAULT_NEXT, safeNext } from './safe-next';

const req = (cookie?: string) => ({ headers: cookie === undefined ? {} : { cookie } });

describe('readCookie', () => {
  it('finds a cookie among others', () => {
    expect(readCookie(req('theme=dark; om_session=abc.def ;other=1'), SESSION_COOKIE)).toBe('abc.def');
  });

  it('keeps everything after the first =', () => {
    expect(readCookie(req('a=b=c'), 'a')).toBe('b=c');
  });

  it('does not match a cookie whose name only contains the one asked for', () => {
    expect(readCookie(req('xom_session=1'), SESSION_COOKIE)).toBeUndefined();
  });

  it('is undefined without a Cookie header', () => {
    expect(readCookie(req(), SESSION_COOKIE)).toBeUndefined();
  });
});

describe('cookie options', () => {
  const res = () => ({ cookie: jest.fn(), clearCookie: jest.fn() });

  it('sets the session cookie httpOnly, lax and secure when asked', () => {
    const r = res();
    setSessionCookie(r as unknown as Response, 'token', true);
    expect(r.cookie).toHaveBeenCalledWith(SESSION_COOKIE, 'token', {
      httpOnly: true,
      sameSite: 'lax',
      secure: true,
      path: '/',
      maxAge: SESSION_TTL_MS,
    });
  });

  it('clears the OAuth cookie on the path it was set on', () => {
    const r = res();
    clearOAuthCookie(r as unknown as Response, false);
    expect(r.clearCookie).toHaveBeenCalledWith(OAUTH_COOKIE, expect.objectContaining({ path: '/api/auth/github' }));
  });
});

describe('safeNext', () => {
  it('keeps same-site paths', () => {
    expect(safeNext('/bounties/12?tab=prs#top')).toBe('/bounties/12?tab=prs#top');
  });

  it.each([['//evil.com'], ['/\\evil.com'], ['https://evil.com'], ['evil.com'], [''], [undefined], [['/a', '/b']]])(
    'falls back for %p',
    (raw) => {
      expect(safeNext(raw)).toBe(DEFAULT_NEXT);
    },
  );

  it('falls back for very long paths', () => {
    expect(safeNext(`/${'a'.repeat(2048)}`)).toBe(DEFAULT_NEXT);
  });
});
