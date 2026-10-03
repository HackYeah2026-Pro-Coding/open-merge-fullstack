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
import { ApiExcludeController } from '@nestjs/swagger';
import type { Request } from 'express';
import type { Env } from '../config/env';
import { ZodValidationPipe } from '../core/pipes/zod-validation.pipe';
import { ReviewService, type WebhookResult } from './review.service';
import { isValidSignature } from './webhook-signature';
import { pullRequestEventSchema, type PullRequestEvent } from './webhook-payload';

/** Receives GitHub webhooks for the AI review. Called by GitHub only, so it stays out of the API docs. */
@ApiExcludeController()
@Controller('review')
export class ReviewWebhookController {
  constructor(
    private readonly reviews: ReviewService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  @Post('webhook')
  @HttpCode(HttpStatus.ACCEPTED)
  async receive(
    @Req() request: RawBodyRequest<Request>,
    @Headers('x-github-event') event: string | undefined,
    @Headers('x-hub-signature-256') signature: string | undefined,
    @Body() body: unknown,
  ): Promise<{ result: WebhookResult | 'pong' }> {
    const secret = this.config.get('GITHUB_WEBHOOK_SECRET', { infer: true });
    if (!secret) throw new ServiceUnavailableException('GITHUB_WEBHOOK_SECRET is not set');
    if (!request.rawBody || !isValidSignature(secret, request.rawBody, signature)) {
      throw new UnauthorizedException('Invalid webhook signature');
    }

    if (event === 'ping') return { result: 'pong' };
    if (event !== 'pull_request') return { result: 'ignored' };

    const payload: PullRequestEvent = new ZodValidationPipe(pullRequestEventSchema).transform(body);
    return { result: await this.reviews.handlePullRequest(payload) };
  }
}
