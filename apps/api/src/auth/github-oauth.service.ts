import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { z } from 'zod';
import type { Env } from '../config/env';

const AUTHORIZE_URL = 'https://github.com/login/oauth/authorize';
const TOKEN_URL = 'https://github.com/login/oauth/access_token';
const USER_URL = 'https://api.github.com/user';

export interface GithubProfile {
  id: number;
  login: string;
  name: string | null;
  avatarUrl: string | null;
}

/** GitHub refused the code: it expired or was already used. Starting sign-in again fixes it. */
export class GithubOAuthError extends Error {
  override name = 'GithubOAuthError';
}

const tokenResponse = z.object({
  access_token: z.string().optional(),
  error: z.string().optional(),
  error_description: z.string().optional(),
});

const userResponse = z.object({
  id: z.number().int(),
  login: z.string(),
  name: z.string().nullable(),
  avatar_url: z.string().nullable(),
});

/**
 * The GitHub side of sign-in. It asks for no scopes, so it only ever sees the
 * public profile, and the access token is used once and dropped.
 */
@Injectable()
export class GithubOAuthService {
  constructor(private readonly config: ConfigService<Env, true>) {}

  /**
   * Built from WEB_ORIGIN, not API_URL: the browser reaches the API through the
   * web app's /api proxy (Vite locally, Vercel in production), which keeps the
   * session cookie first-party.
   */
  callbackUrl(): string {
    const origin = this.config.get('WEB_ORIGIN', { infer: true }).replace(/\/+$/, '');
    return `${origin}/api/auth/github/callback`;
  }

  authorizeUrl(state: string): string {
    const { clientId } = this.credentials();
    const params = new URLSearchParams({ client_id: clientId, redirect_uri: this.callbackUrl(), state });
    return `${AUTHORIZE_URL}?${params}`;
  }

  async profileForCode(code: string): Promise<GithubProfile> {
    return this.fetchProfile(await this.exchangeCode(code));
  }

  private async exchangeCode(code: string): Promise<string> {
    const { clientId, clientSecret } = this.credentials();
    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: this.callbackUrl(),
      }),
    });
    if (!res.ok) throw new Error(`GitHub token exchange failed: ${res.status} ${res.statusText}`);

    // GitHub reports a bad code as 200 with an `error` field.
    const body = tokenResponse.parse(await res.json());
    if (body.error === 'bad_verification_code') throw new GithubOAuthError(body.error_description ?? body.error);
    if (body.error || !body.access_token) {
      throw new Error(`GitHub token exchange failed: ${body.error ?? 'no access_token'} ${body.error_description ?? ''}`.trim());
    }
    return body.access_token;
  }

  private async fetchProfile(accessToken: string): Promise<GithubProfile> {
    const res = await fetch(USER_URL, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'OpenMerge',
      },
    });
    if (!res.ok) throw new Error(`GitHub profile request failed: ${res.status} ${res.statusText}`);

    const user = userResponse.parse(await res.json());
    return { id: user.id, login: user.login, name: user.name, avatarUrl: user.avatar_url };
  }

  private credentials(): { clientId: string; clientSecret: string } {
    const clientId = this.config.get('GITHUB_CLIENT_ID', { infer: true });
    const clientSecret = this.config.get('GITHUB_CLIENT_SECRET', { infer: true });
    if (!clientId || !clientSecret) {
      throw new ServiceUnavailableException(
        'GitHub sign-in is not configured. Set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET.',
      );
    }
    return { clientId, clientSecret };
  }
}
