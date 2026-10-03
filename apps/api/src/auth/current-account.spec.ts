import { type ExecutionContext, UnauthorizedException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env';
import { SESSION_TTL_MS, createOAuthState, createSessionToken } from './auth-tokens';
import { AccountGuard } from './current-account';

const SECRET = 's'.repeat(32);
const guard = new AccountGuard({ get: () => SECRET } as unknown as ConfigService<Env, true>);

function contextWith(cookie?: string) {
  const request: { headers: { cookie?: string }; githubLogin?: string } = { headers: cookie ? { cookie } : {} };
  const context = { switchToHttp: () => ({ getRequest: () => request }) } as unknown as ExecutionContext;
  return { context, request };
}

describe('AccountGuard', () => {
  it('takes the GitHub login from a valid session cookie', () => {
    const { context, request } = contextWith(`om_session=${createSessionToken({ githubId: 1, githubLogin: 'ada' }, SECRET)}`);
    expect(guard.canActivate(context)).toBe(true);
    expect(request.githubLogin).toBe('ada');
  });

  it('ignores the old development header', () => {
    const { context } = contextWith();
    (context.switchToHttp().getRequest() as { headers: Record<string, string> }).headers['x-dev-github-login'] = 'ada';
    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });

  it.each([
    ['no cookie', undefined],
    ['a forged cookie', `om_session=${createSessionToken({ githubId: 1, githubLogin: 'ada' }, 'o'.repeat(32))}`],
    ['an expired cookie', `om_session=${createSessionToken({ githubId: 1, githubLogin: 'ada' }, SECRET, Date.now() - SESSION_TTL_MS - 1)}`],
    ['an OAuth state passed off as a session', `om_session=${createOAuthState('/', SECRET).state}`],
  ])('rejects %s', (_label, cookie) => {
    expect(() => guard.canActivate(contextWith(cookie).context)).toThrow(UnauthorizedException);
  });
});
