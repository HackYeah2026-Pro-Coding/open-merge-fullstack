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

export const DEV_ACCOUNT_HEADER = 'x-dev-github-login';

/**
 * Placeholder until GitHub sign-in exists. It trusts a header naming the account,
 * so it refuses to run in production. Replace this guard, keep the decorator.
 */
@Injectable()
export class AccountGuard implements CanActivate {
  constructor(private readonly config: ConfigService<Env, true>) {}

  canActivate(context: ExecutionContext): boolean {
    if (this.config.get('NODE_ENV', { infer: true }) === 'production') {
      throw new UnauthorizedException('Sign-in is not available yet.');
    }
    const request = context.switchToHttp().getRequest<Request & { githubLogin?: string }>();
    const login = request.header(DEV_ACCOUNT_HEADER);
    if (!login) throw new UnauthorizedException('Sign in with GitHub first.');
    request.githubLogin = login;
    return true;
  }
}

/** The GitHub login of the signed-in account. Use together with AccountGuard. */
export const CurrentLogin = createParamDecorator((_data: unknown, context: ExecutionContext): string => {
  return context.switchToHttp().getRequest<{ githubLogin: string }>().githubLogin;
});
