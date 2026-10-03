import { GoogleGenAI } from '@google/genai';
import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env';
import type { ReviewerAnswer } from '../review-output';
import { runToolLoop } from '../tools/tool-loop';
import { GeminiConversation } from './gemini-conversation';
import type { Reviewer, ReviewRequest } from './reviewer';

/**
 * Attempts per request, retrying 408, 429 and 5xx with backoff. The Anthropic SDK does
 * this by default; this SDK does not, and Gemini answers 503 when a model is busy.
 */
export const GEMINI_ATTEMPTS = 3;

@Injectable()
export class GeminiReviewer implements Reviewer {
  readonly name = 'gemini' as const;
  private client?: GoogleGenAI;

  constructor(private readonly config: ConfigService<Env, true>) {}

  async review({ prompt, tools }: ReviewRequest): Promise<ReviewerAnswer> {
    const model = this.config.get('GEMINI_MODEL', { infer: true });
    if (!model) throw new ServiceUnavailableException('GEMINI_MODEL is not set');
    return runToolLoop(new GeminiConversation(this.genai(), model, prompt), tools);
  }

  private genai(): GoogleGenAI {
    if (this.client) return this.client;
    const apiKey = this.config.get('GEMINI_API_KEY', { infer: true });
    if (!apiKey) throw new ServiceUnavailableException('GEMINI_API_KEY is not set');
    return (this.client = new GoogleGenAI({ apiKey, httpOptions: { retryOptions: { attempts: GEMINI_ATTEMPTS } } }));
  }
}
