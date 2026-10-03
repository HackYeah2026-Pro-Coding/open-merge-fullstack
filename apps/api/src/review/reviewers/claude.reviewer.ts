import Anthropic from '@anthropic-ai/sdk';
import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env';
import type { ReviewerAnswer } from '../review-output';
import { runToolLoop } from '../tools/tool-loop';
import { ClaudeConversation } from './claude-conversation';
import type { Reviewer, ReviewRequest } from './reviewer';

@Injectable()
export class ClaudeReviewer implements Reviewer {
  readonly name = 'claude' as const;
  private client?: Anthropic;

  constructor(private readonly config: ConfigService<Env, true>) {}

  async review({ prompt, tools }: ReviewRequest): Promise<ReviewerAnswer> {
    const model = this.config.get('CLAUDE_REVIEW_MODEL', { infer: true });
    return runToolLoop(new ClaudeConversation(this.anthropic(), model, prompt), tools);
  }

  private anthropic(): Anthropic {
    if (this.client) return this.client;
    const apiKey = this.config.get('ANTHROPIC_API_KEY', { infer: true });
    if (!apiKey) throw new ServiceUnavailableException('ANTHROPIC_API_KEY is not set');
    return (this.client = new Anthropic({ apiKey }));
  }
}
