import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { User } from '@escrow/shared';
import type { Env } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';
import {
  type OAuthStatePayload,
  createOAuthState,
  createOwnerToken,
  createSessionToken,
  readOAuthState,
  readOwnerToken,
  readSessionToken,
  sameNonce,
} from './auth-tokens';
import { GithubOAuthService } from './github-oauth.service';
import { safeNext } from './safe-next';
import { InvalidTokenError } from './signed-token';
import { toOwnerUser, toUser } from './to-user';

/** Developer sign-in with GitHub. It identifies people; it has no say over funds. */
@Injectable()
export class AuthService {
  constructor(
    private readonly github: GithubOAuthService,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  /** Where to send the browser to start sign-in, and the nonce to pin in a cookie. */
  start(next: unknown): { url: string; nonce: string } {
    const { state, nonce } = createOAuthState(safeNext(next), this.secret());
    return { url: this.github.authorizeUrl(state), nonce };
  }

  /** The state GitHub echoed back, or null when it is forged, expired or from another browser. */
  verifyState(state: string | undefined, nonce: string | undefined): OAuthStatePayload | null {
    if (!state || !nonce) return null;
    let payload: OAuthStatePayload;
    try {
      payload = readOAuthState(state, this.secret());
    } catch (error) {
      if (error instanceof InvalidTokenError) return null;
      throw error;
    }
    return sameNonce(payload.nonce, nonce) ? payload : null;
  }

  /** Reads the GitHub profile, keeps the account in step with it and returns a session token. */
  async signIn(code: string): Promise<string> {
    const profile = await this.github.profileForCode(code);
    const fields = { githubLogin: profile.login, name: profile.name, avatarUrl: profile.avatarUrl };
    const account = await this.prisma.githubAccount.upsert({
      where: { githubId: profile.id },
      create: { githubId: profile.id, ...fields },
      update: fields,
    });
    return createSessionToken(account, this.secret());
  }

  /** The signed-in user, or null for no cookie, a forged or expired one, or an account that is gone. */
  async userForSession(token: string | undefined): Promise<User | null> {
    if (!token) return null;
    let githubId: number;
    try {
      githubId = readSessionToken(token, this.secret()).githubId;
    } catch (error) {
      if (error instanceof InvalidTokenError) return null;
      throw error;
    }
    const account = await this.prisma.githubAccount.findUnique({ where: { githubId }, include: { wallet: true } });
    return account ? toUser(account) : null;
  }

  /**
   * Token for the owner view. Deliberately asks for no credentials: there is one
   * owner per organization and the demo opens it with a click.
   */
  ownerToken(): string {
    return createOwnerToken(this.secret());
  }

  /** True for a valid owner-view token; false for none, a forged or an expired one. */
  isOwnerView(token: string | undefined): boolean {
    if (!token) return false;
    try {
      readOwnerToken(token, this.secret());
      return true;
    } catch (error) {
      if (error instanceof InvalidTokenError) return false;
      throw error;
    }
  }

  async ownerUser(): Promise<User> {
    const login = this.config.get('GITHUB_OWNER_LOGIN', { infer: true });
    const account = await this.prisma.githubAccount.findFirst({
      where: { githubLogin: { equals: login, mode: 'insensitive' } },
      include: { wallet: true },
    });
    return toOwnerUser(login, account);
  }

  private secret(): string {
    return this.config.get('SESSION_SECRET', { infer: true });
  }
}
