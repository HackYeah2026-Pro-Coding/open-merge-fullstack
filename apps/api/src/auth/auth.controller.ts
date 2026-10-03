import {
  BadRequestException,
  Controller,
  Get,
  HttpCode,
  Post,
  Query,
  Redirect,
  Req,
  Res,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiTags } from '@nestjs/swagger';
import type { Session, SignInError } from '@escrow/shared';
import type { Request, Response } from 'express';
import { z } from 'zod';
import type { Env } from '../config/env';
import { AuthService } from './auth.service';
import {
  OAUTH_COOKIE,
  SESSION_COOKIE,
  clearOAuthCookie,
  clearSessionCookie,
  readCookie,
  setOAuthCookie,
  setSessionCookie,
} from './cookies';
import { GithubOAuthError } from './github-oauth.service';

interface RedirectTo {
  url: string;
}

const callbackQuery = z.object({
  code: z.string().max(512).optional(),
  state: z.string().max(4096).optional(),
  error: z.string().max(256).optional(),
});

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  private readonly secure: boolean;
  private readonly webOrigin: string;

  constructor(
    private readonly auth: AuthService,
    config: ConfigService<Env, true>,
  ) {
    this.secure = config.get('NODE_ENV', { infer: true }) === 'production';
    this.webOrigin = config.get('WEB_ORIGIN', { infer: true }).replace(/\/+$/, '');
  }

  /** Starts GitHub sign-in. `next` is the path to land on afterwards. */
  @Get('github')
  @Redirect()
  start(@Query('next') next: unknown, @Res({ passthrough: true }) res: Response): RedirectTo {
    const { url, nonce } = this.auth.start(next);
    setOAuthCookie(res, nonce, this.secure);
    return { url };
  }

  /** GitHub sends the browser back here. Expected failures land on the sign-in page with a reason. */
  @Get('github/callback')
  @Redirect()
  async callback(
    @Query() query: unknown,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<RedirectTo> {
    const parsed = callbackQuery.safeParse(query);
    if (!parsed.success) throw new BadRequestException('Malformed sign-in callback.');
    const params = parsed.data;

    const nonce = readCookie(req, OAUTH_COOKIE);
    clearOAuthCookie(res, this.secure);

    const state = this.auth.verifyState(params.state, nonce);
    if (!state) return this.signInPage('state_mismatch');
    if (params.error === 'access_denied') return this.signInPage('access_denied', state.next);
    // Anything else (redirect_uri_mismatch, a suspended app) is our misconfiguration: fail loudly.
    if (params.error) throw new Error(`GitHub sign-in failed: ${params.error}`);
    if (!params.code) throw new BadRequestException('The sign-in callback has no code.');

    let session: string;
    try {
      session = await this.auth.signIn(params.code);
    } catch (error) {
      if (error instanceof GithubOAuthError) return this.signInPage('github', state.next);
      throw error;
    }
    setSessionCookie(res, session, this.secure);
    return { url: `${this.webOrigin}${state.next}` };
  }

  @Get('session')
  async session(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<Session> {
    const token = readCookie(req, SESSION_COOKIE);
    const user = await this.auth.userForSession(token);
    if (token && !user) clearSessionCookie(res, this.secure);
    return { user };
  }

  /** Sessions are stateless, so signing out is clearing the cookie. */
  @Post('sign-out')
  @HttpCode(204)
  signOut(@Res({ passthrough: true }) res: Response): void {
    clearSessionCookie(res, this.secure);
  }

  private signInPage(error: SignInError, next?: string): RedirectTo {
    const params = new URLSearchParams({ error });
    if (next) params.set('next', next);
    return { url: `${this.webOrigin}/sign-in?${params}` };
  }
}
