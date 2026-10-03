import type { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import type { Env } from '../config/env';
import type { PrismaService } from '../prisma/prisma.service';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { createOwnerToken, createSessionToken, readOAuthState, readOwnerToken, readSessionToken } from './auth-tokens';
import { OAUTH_COOKIE, OWNER_COOKIE, SESSION_COOKIE } from './cookies';
import { GithubOAuthError, type GithubOAuthService } from './github-oauth.service';

const SECRET = 's'.repeat(32);
const WEB = 'http://localhost:5173';
const PROFILE = { id: 42, login: 'ada', name: 'Ada', avatarUrl: 'https://avatars.example/42' };
const ACCOUNT = { id: 'acc1', githubId: 42, githubLogin: 'ada', name: 'Ada', avatarUrl: 'https://avatars.example/42' };

function setup() {
  const github = {
    authorizeUrl: jest.fn((state: string) => `https://github.com/login/oauth/authorize?state=${encodeURIComponent(state)}`),
    profileForCode: jest.fn().mockResolvedValue(PROFILE),
  };
  const prisma = {
    githubAccount: {
      upsert: jest.fn().mockResolvedValue(ACCOUNT),
      findUnique: jest.fn().mockResolvedValue({ ...ACCOUNT, wallet: null }),
      findFirst: jest.fn().mockResolvedValue(null),
    },
  };
  const values: Record<string, string> = {
    SESSION_SECRET: SECRET,
    NODE_ENV: 'development',
    WEB_ORIGIN: WEB,
    GITHUB_OWNER_LOGIN: 'acme-owner',
  };
  const config = { get: (key: string) => values[key] } as unknown as ConfigService<Env, true>;
  const auth = new AuthService(github as unknown as GithubOAuthService, prisma as unknown as PrismaService, config);
  return { controller: new AuthController(auth, config), github, prisma };
}

const fakeRes = () => ({ cookie: jest.fn(), clearCookie: jest.fn() });
type FakeRes = ReturnType<typeof fakeRes>;
const asRes = (res: FakeRes) => res as unknown as Response;
const reqWith = (cookies: Record<string, string> = {}) =>
  ({ headers: { cookie: Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; ') } }) as unknown as Request;

/** Runs the first leg and returns what GitHub echoes back plus the nonce cookie the browser holds. */
function begin(controller: AuthController, next?: string) {
  const res = fakeRes();
  const { url } = controller.start(next, asRes(res));
  const state = new URL(url).searchParams.get('state') ?? '';
  const nonce = res.cookie.mock.calls.find(([name]) => name === OAUTH_COOKIE)?.[1] as string;
  return { state, nonce, res };
}

const sessionCookie = (res: FakeRes) => res.cookie.mock.calls.find(([name]) => name === SESSION_COOKIE)?.[1] as string | undefined;

describe('AuthController', () => {
  it('starts sign-in with a signed state and a nonce cookie scoped to the sign-in routes', () => {
    const { controller } = setup();
    const { state, nonce, res } = begin(controller, '/account');
    expect(readOAuthState(state, SECRET)).toMatchObject({ next: '/account', nonce });
    expect(res.cookie).toHaveBeenCalledWith(OAUTH_COOKIE, nonce, expect.objectContaining({ httpOnly: true, path: '/api/auth/github' }));
  });

  it('never carries an off-site next through sign-in', () => {
    const { controller } = setup();
    expect(readOAuthState(begin(controller, '//evil.com').state, SECRET).next).toBe('/bounties');
  });

  it('signs in, sets the session cookie and lands on next', async () => {
    const { controller, prisma } = setup();
    const { state, nonce } = begin(controller, '/account');
    const res = fakeRes();

    const result = await controller.callback({ code: 'c', state }, reqWith({ [OAUTH_COOKIE]: nonce }), asRes(res));

    expect(result).toEqual({ url: `${WEB}/account` });
    expect(prisma.githubAccount.upsert).toHaveBeenCalledWith({
      where: { githubId: 42 },
      create: { githubId: 42, githubLogin: 'ada', name: 'Ada', avatarUrl: PROFILE.avatarUrl },
      update: { githubLogin: 'ada', name: 'Ada', avatarUrl: PROFILE.avatarUrl },
    });
    expect(readSessionToken(sessionCookie(res) ?? '', SECRET)).toMatchObject({ githubId: 42, githubLogin: 'ada' });
    expect(res.clearCookie).toHaveBeenCalledWith(OAUTH_COOKIE, expect.anything());
  });

  it.each([
    ['without the nonce cookie', {}],
    ['from a browser that started another sign-in', { [OAUTH_COOKIE]: 'someone-elses-nonce' }],
  ])('refuses a callback %s', async (_label, cookies) => {
    const { controller, github } = setup();
    const { state } = begin(controller, '/account');
    const res = fakeRes();

    const result = await controller.callback({ code: 'c', state }, reqWith(cookies), asRes(res));

    expect(result).toEqual({ url: `${WEB}/sign-in?error=state_mismatch` });
    expect(github.profileForCode).not.toHaveBeenCalled();
    expect(sessionCookie(res)).toBeUndefined();
  });

  it('refuses a forged state', async () => {
    const { controller } = setup();
    const result = await controller.callback({ code: 'c', state: 'forged.state' }, reqWith({ [OAUTH_COOKIE]: 'n' }), asRes(fakeRes()));
    expect(result).toEqual({ url: `${WEB}/sign-in?error=state_mismatch` });
  });

  it('returns to sign-in when the developer cancels on GitHub', async () => {
    const { controller, github } = setup();
    const { state, nonce } = begin(controller, '/account');
    const result = await controller.callback({ error: 'access_denied', state }, reqWith({ [OAUTH_COOKIE]: nonce }), asRes(fakeRes()));
    expect(result).toEqual({ url: `${WEB}/sign-in?error=access_denied&next=%2Faccount` });
    expect(github.profileForCode).not.toHaveBeenCalled();
  });

  it('returns to sign-in when GitHub rejects the code', async () => {
    const { controller, github } = setup();
    github.profileForCode.mockRejectedValueOnce(new GithubOAuthError('expired'));
    const { state, nonce } = begin(controller, '/account');
    const res = fakeRes();

    const result = await controller.callback({ code: 'c', state }, reqWith({ [OAUTH_COOKIE]: nonce }), asRes(res));

    expect(result).toEqual({ url: `${WEB}/sign-in?error=github&next=%2Faccount` });
    expect(sessionCookie(res)).toBeUndefined();
  });

  it('lets unexpected failures propagate', async () => {
    const { controller, github } = setup();
    github.profileForCode.mockRejectedValueOnce(new Error('GitHub profile request failed: 502'));
    const { state, nonce } = begin(controller);
    await expect(controller.callback({ code: 'c', state }, reqWith({ [OAUTH_COOKIE]: nonce }), asRes(fakeRes()))).rejects.toThrow('502');
  });

  it('fails loudly on a GitHub error that means misconfiguration', async () => {
    const { controller } = setup();
    const { state, nonce } = begin(controller);
    await expect(
      controller.callback({ error: 'redirect_uri_mismatch', state }, reqWith({ [OAUTH_COOKIE]: nonce }), asRes(fakeRes())),
    ).rejects.toThrow('redirect_uri_mismatch');
  });

  describe('session', () => {
    it('returns the signed-in user', async () => {
      const { controller } = setup();
      const res = fakeRes();
      const token = createSessionToken(ACCOUNT, SECRET);
      await expect(controller.session(reqWith({ [SESSION_COOKIE]: token }), asRes(res))).resolves.toEqual({
        user: { id: 'acc1', githubLogin: 'ada', name: 'Ada', avatarUrl: PROFILE.avatarUrl, role: 'developer', wallet: null },
      });
      expect(res.clearCookie).not.toHaveBeenCalled();
    });

    it('is empty without a cookie', async () => {
      const { controller } = setup();
      const res = fakeRes();
      await expect(controller.session(reqWith(), asRes(res))).resolves.toEqual({ user: null });
      expect(res.clearCookie).not.toHaveBeenCalled();
    });

    it('drops a forged cookie', async () => {
      const { controller } = setup();
      const res = fakeRes();
      const token = createSessionToken(ACCOUNT, 'o'.repeat(32));
      await expect(controller.session(reqWith({ [SESSION_COOKIE]: token }), asRes(res))).resolves.toEqual({ user: null });
      expect(res.clearCookie).toHaveBeenCalledWith(SESSION_COOKIE, expect.anything());
    });

    it('drops a cookie for an account that no longer exists', async () => {
      const { controller, prisma } = setup();
      prisma.githubAccount.findUnique.mockResolvedValueOnce(null);
      const res = fakeRes();
      const token = createSessionToken(ACCOUNT, SECRET);
      await expect(controller.session(reqWith({ [SESSION_COOKIE]: token }), asRes(res))).resolves.toEqual({ user: null });
      expect(res.clearCookie).toHaveBeenCalledWith(SESSION_COOKIE, expect.anything());
    });
  });

  it('signs out by clearing the session cookie', () => {
    const { controller } = setup();
    const res = fakeRes();
    controller.signOut(reqWith(), asRes(res));
    expect(res.clearCookie).toHaveBeenCalledWith(SESSION_COOKIE, expect.objectContaining({ path: '/' }));
  });

  describe('owner view', () => {
    const OWNER = {
      id: 'owner:acme-owner',
      githubLogin: 'acme-owner',
      name: null,
      avatarUrl: 'https://github.com/acme-owner.png',
      role: 'maintainer',
      wallet: null,
    };

    it('opens with a signed owner cookie', () => {
      const { controller } = setup();
      const res = fakeRes();
      controller.openOwnerView(asRes(res));
      const token = res.cookie.mock.calls.find(([name]) => name === OWNER_COOKIE)?.[1] as string;
      expect(readOwnerToken(token, SECRET)).toMatchObject({ kind: 'owner' });
      expect(res.cookie).toHaveBeenCalledWith(OWNER_COOKIE, token, expect.objectContaining({ httpOnly: true, path: '/' }));
    });

    it('answers the session with the configured owner over the developer session', async () => {
      const { controller } = setup();
      const cookies = { [OWNER_COOKIE]: createOwnerToken(SECRET), [SESSION_COOKIE]: createSessionToken(ACCOUNT, SECRET) };
      await expect(controller.session(reqWith(cookies), asRes(fakeRes()))).resolves.toEqual({ user: OWNER });
    });

    it("uses the owner's account when they have signed in before, without a wallet", async () => {
      const { controller, prisma } = setup();
      prisma.githubAccount.findFirst.mockResolvedValueOnce({
        ...ACCOUNT,
        githubLogin: 'acme-owner',
        wallet: { address: 'addr', linkedAt: new Date() },
      });
      const { user } = await controller.session(reqWith({ [OWNER_COOKIE]: createOwnerToken(SECRET) }), asRes(fakeRes()));
      expect(user).toMatchObject({ id: 'acc1', githubLogin: 'acme-owner', name: 'Ada', role: 'maintainer', wallet: null });
    });

    it('drops a forged owner cookie and falls back to the developer session', async () => {
      const { controller } = setup();
      const res = fakeRes();
      const cookies = {
        [OWNER_COOKIE]: createOwnerToken('o'.repeat(32)),
        [SESSION_COOKIE]: createSessionToken(ACCOUNT, SECRET),
      };
      const { user } = await controller.session(reqWith(cookies), asRes(res));
      expect(user).toMatchObject({ githubLogin: 'ada', role: 'developer' });
      expect(res.clearCookie).toHaveBeenCalledWith(OWNER_COOKIE, expect.anything());
    });

    it('leaving it keeps the developer signed in', () => {
      const { controller } = setup();
      const res = fakeRes();
      const cookies = { [OWNER_COOKIE]: createOwnerToken(SECRET), [SESSION_COOKIE]: createSessionToken(ACCOUNT, SECRET) };
      controller.signOut(reqWith(cookies), asRes(res));
      expect(res.clearCookie).toHaveBeenCalledWith(OWNER_COOKIE, expect.anything());
      expect(res.clearCookie).not.toHaveBeenCalledWith(SESSION_COOKIE, expect.anything());
    });
  });
});
