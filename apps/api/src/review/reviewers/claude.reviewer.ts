import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env';
import { REVIEW_SYSTEM_PROMPT } from '../review-prompt';
import { reviewOutputSchema, type ReviewerAnswer } from '../review-output';
import type { Reviewer } from './reviewer';

@Injectable()
export class ClaudeReviewer implements Reviewer {
  readonly name = 'claude' as const;
  private client?: Anthropic;

  constructor(private readonly config: ConfigService<Env, true>) {}

  async review(prompt: string): Promise<ReviewerAnswer> {
    const model = this.config.get('CLAUDE_REVIEW_MODEL', { infer: true });
    const response = await this.anthropic().beta.messages.parse({
      model,
      max_tokens: 16000,
      thinking: { type: 'adaptive' },
      output_config: { effort: 'high', format: zodOutputFormat(reviewOutputSchema) },
      // If the model declines for policy reasons, the API retries on its default fallback.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: REVIEW_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: prompt }],
    });

    if (response.stop_reason === 'refusal') {
      throw new Error(`Claude refused the review (${response.stop_details?.category ?? 'no category'})`);
    }
    if (response.parsed_output === null) {
      throw new Error(`Claude returned no structured review (stop reason: ${response.stop_reason})`);
    }
    return {
      output: response.parsed_output,
      model: response.model,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    };
  }

  private anthropic(): Anthropic {
    if (this.client) return this.client;
    const apiKey = this.config.get('ANTHROPIC_API_KEY', { infer: true });
    if (!apiKey) throw new ServiceUnavailableException('ANTHROPIC_API_KEY is not set');
    return (this.client = new Anthropic({ apiKey }));
  }
}
