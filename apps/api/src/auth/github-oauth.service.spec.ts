import { ServiceUnavailableException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env';
import { GithubOAuthError, GithubOAuthService } from './github-oauth.service';

const CONFIGURED = { WEB_ORIGIN: 'http://localhost:5173/', GITHUB_CLIENT_ID: 'client-id', GITHUB_CLIENT_SECRET: 'client-secret' };

function service(values: Record<string, string | undefined> = CONFIGURED) {
  const config = { get: (key: string) => values[key] } as unknown as ConfigService<Env, true>;
  return new GithubOAuthService(config);
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const PROFILE = { id: 42, login: 'ada', name: 'Ada Lovelace', avatar_url: 'https://avatars.example/42' };

describe('GithubOAuthService', () => {
  let fetchMock: jest.SpiedFunction<typeof fetch>;
  beforeEach(() => {
    fetchMock = jest.spyOn(globalThis, 'fetch');
  });
  afterEach(() => fetchMock.mockRestore());

  it('builds the authorize URL from WEB_ORIGIN and asks for no scopes', () => {
    const url = new URL(service().authorizeUrl('signed-state'));
    expect(url.origin + url.pathname).toBe('https://github.com/login/oauth/authorize');
    expect(url.searchParams.get('client_id')).toBe('client-id');
    expect(url.searchParams.get('redirect_uri')).toBe('http://localhost:5173/api/auth/github/callback');
    expect(url.searchParams.get('state')).toBe('signed-state');
    expect(url.searchParams.has('scope')).toBe(false);
  });

  it('answers 503 until the OAuth App is configured', () => {
    expect(() => service({ WEB_ORIGIN: 'http://localhost:5173' }).authorizeUrl('s')).toThrow(ServiceUnavailableException);
  });

  it('exchanges the code and reads the public profile', async () => {
    fetchMock.mockResolvedValueOnce(json({ access_token: 'gho_token' })).mockResolvedValueOnce(json(PROFILE));

    await expect(service().profileForCode('the-code')).resolves.toEqual({
      id: 42,
      login: 'ada',
      name: 'Ada Lovelace',
      avatarUrl: 'https://avatars.example/42',
    });

    const [tokenUrl, tokenInit] = fetchMock.mock.calls[0];
    expect(tokenUrl).toBe('https://github.com/login/oauth/access_token');
    expect(JSON.parse(String(tokenInit?.body))).toEqual({
      client_id: 'client-id',
      client_secret: 'client-secret',
      code: 'the-code',
      redirect_uri: 'http://localhost:5173/api/auth/github/callback',
    });
    const [userUrl, userInit] = fetchMock.mock.calls[1];
    expect(userUrl).toBe('https://api.github.com/user');
    expect(userInit?.headers).toMatchObject({ Authorization: 'Bearer gho_token' });
  });

  it('reports an expired or reused code as GithubOAuthError', async () => {
    fetchMock.mockResolvedValueOnce(json({ error: 'bad_verification_code', error_description: 'The code is incorrect or expired.' }));
    await expect(service().profileForCode('old')).rejects.toBeInstanceOf(GithubOAuthError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('fails loudly on misconfiguration instead of asking the user to retry', async () => {
    fetchMock.mockResolvedValueOnce(json({ error: 'incorrect_client_credentials' }));
    const failure = service().profileForCode('code');
    await expect(failure).rejects.toThrow('incorrect_client_credentials');
    await expect(failure).rejects.not.toBeInstanceOf(GithubOAuthError);
  });

  it('fails when GitHub answers with an error status', async () => {
    fetchMock.mockResolvedValueOnce(json({ access_token: 'gho_token' })).mockResolvedValueOnce(json({}, 502));
    await expect(service().profileForCode('code')).rejects.toThrow('GitHub profile request failed: 502');
  });
});
