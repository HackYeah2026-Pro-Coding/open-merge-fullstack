import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
  createParamDecorator,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import type { Env } from '../config/env';
import { readSessionToken } from './auth-tokens';
import { SESSION_COOKIE, readCookie } from './cookies';
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

/** The GitHub login of the signed-in account. Use together with AccountGuard. */
export const CurrentLogin = createParamDecorator((_data: unknown, context: ExecutionContext): string => {
  return context.switchToHttp().getRequest<{ githubLogin: string }>().githubLogin;
});
