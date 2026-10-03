import { Body, Controller, Headers, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { ZodValidationPipe } from '../core/pipes/zod-validation.pipe';

/** The part of a `pull_request` payload that tells a merge apart; the rest is kept as sent. */
const pullRequestEventSchema = z.looseObject({
  action: z.string(),
  pull_request: z.looseObject({ merged: z.boolean().optional() }),
});

@ApiTags('merge')
@Controller('merge')
export class MergeController {
  /**
   * Receives GitHub `pull_request` webhook events and acts only on a merge,
   * which GitHub sends as `closed` with `pull_request.merged: true`. No handling
   * yet — a merge payload is echoed back as-is.
   */
  @Post('webhook-handler')
  @HttpCode(HttpStatus.OK)
  webhookHandler(
    @Headers('x-github-event') event: string | undefined,
    @Body() body: unknown,
  ): unknown {
    if (event !== 'pull_request') return { result: 'ignored' };

    const payload = new ZodValidationPipe(pullRequestEventSchema).transform(body);
    if (payload.action !== 'closed' || payload.pull_request.merged !== true) return { result: 'ignored' };

    return payload;
  }
}
