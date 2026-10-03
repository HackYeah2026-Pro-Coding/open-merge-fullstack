import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
  createParamDecorator,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import type { Env } from '../config/env';
import { readOwnerToken, readSessionToken } from './auth-tokens';
import { OWNER_COOKIE, SESSION_COOKIE, readCookie } from './cookies';
import { InvalidTokenError } from './signed-token';

/** Lets a request through only with a valid session cookie from GitHub sign-in. */
@Injectable()
export class AccountGuard implements CanActivate {
  constructor(private readonly config: ConfigService<Env, true>) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request & { githubLogin?: string }>();
    const token = readCookie(request, SESSION_COOKIE);
    if (!token) throw new UnauthorizedException('Sign in with GitHub first.');
    try {
      request.githubLogin = readSessionToken(token, this.config.get('SESSION_SECRET', { infer: true })).githubLogin;
    } catch (error) {
      if (error instanceof InvalidTokenError) throw new UnauthorizedException('Your session expired. Sign in again.');
      throw error;
    }
    return true;
  }
}

/** Lets a request through only while the owner view is open. */
@Injectable()
export class OwnerGuard implements CanActivate {
  constructor(private readonly config: ConfigService<Env, true>) {}

  canActivate(context: ExecutionContext): boolean {
    const token = readCookie(context.switchToHttp().getRequest<Request>(), OWNER_COOKIE);
    if (!token) throw new ForbiddenException('Open the owner view first.');
    try {
      readOwnerToken(token, this.config.get('SESSION_SECRET', { infer: true }));
    } catch (error) {
      if (error instanceof InvalidTokenError) throw new ForbiddenException('The owner view expired. Open it again.');
      throw error;
    }
    return true;
  }
}

/**
 * Lets a request through for whoever the app shows as signed in: the owner view,
 * or else a developer session. An expired owner view falls back to the session,
 * as GET /auth/session does.
 */
@Injectable()
export class SignedInGuard implements CanActivate {
  private readonly account: AccountGuard;

  constructor(private readonly config: ConfigService<Env, true>) {
    this.account = new AccountGuard(config);
  }

  canActivate(context: ExecutionContext): boolean {
    const token = readCookie(context.switchToHttp().getRequest<Request>(), OWNER_COOKIE);
    if (token && this.isOwnerView(token)) return true;
    return this.account.canActivate(context);
  }

  private isOwnerView(token: string): boolean {
    try {
      readOwnerToken(token, this.config.get('SESSION_SECRET', { infer: true }));
      return true;
    } catch (error) {
      if (error instanceof InvalidTokenError) return false;
      throw error;
    }
  }
}

/** The GitHub login of the signed-in account. Use together with AccountGuard. */
export const CurrentLogin = createParamDecorator((_data: unknown, context: ExecutionContext): string => {
  return context.switchToHttp().getRequest<{ githubLogin: string }>().githubLogin;
});
