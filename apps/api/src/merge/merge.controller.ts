import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  ServiceUnavailableException,
  UnauthorizedException,
  type RawBodyRequest,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import type { Env } from '../config/env';
import { ZodValidationPipe } from '../core/pipes/zod-validation.pipe';
import { pullRequestEventSchema, type PullRequestEvent } from '../review/webhook-payload';
import { isValidSignature } from '../review/webhook-signature';
import { MergeService, type MergeResult } from './merge.service';

@ApiTags('merge')
@Controller('merge')
export class MergeController {
  constructor(
    private readonly merges: MergeService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  /**
   * Receives GitHub `pull_request` webhook events and acts only on `closed`;
   * a merge is `closed` with `pull_request.merged: true` and releases the bounty.
   * The signature is checked first, since a forged merge would move money.
   */
  @Post('webhook-handler')
  @HttpCode(HttpStatus.OK)
  async webhookHandler(
    @Req() request: RawBodyRequest<Request>,
    @Headers('x-github-event') event: string | undefined,
    @Headers('x-hub-signature-256') signature: string | undefined,
    @Body() body: unknown,
  ): Promise<{ result: MergeResult | 'pong' }> {
    const secret = this.config.get('GITHUB_WEBHOOK_SECRET', { infer: true });
    if (!secret) throw new ServiceUnavailableException('GITHUB_WEBHOOK_SECRET is not set');
    if (!request.rawBody || !isValidSignature(secret, request.rawBody, signature)) {
      throw new UnauthorizedException('Invalid webhook signature');
    }

    if (event === 'ping') return { result: 'pong' };
    if (event !== 'pull_request') return { result: 'ignored' };

    const payload: PullRequestEvent = new ZodValidationPipe(pullRequestEventSchema).transform(body);
    return { result: await this.merges.handleClosed(payload) };
  }
}
