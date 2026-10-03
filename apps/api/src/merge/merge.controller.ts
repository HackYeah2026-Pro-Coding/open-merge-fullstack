import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

@ApiTags('merge')
@Controller('merge')
export class MergeController {
  /**
   * Receives GitHub `pull_request` webhook events. No handling yet — the
   * payload is echoed back as-is.
   */
  @Post('webhook-handler')
  @HttpCode(HttpStatus.OK)
  webhookHandler(@Body() payload: unknown): unknown {
    return payload;
  }
}
