import { GoogleGenAI } from '@google/genai';
import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { z } from 'zod';
import type { Env } from '../../config/env';
import { REVIEW_SYSTEM_PROMPT } from '../review-prompt';
import { reviewOutputSchema, type ReviewerAnswer } from '../review-output';
import type { Reviewer } from './reviewer';

@Injectable()
export class GeminiReviewer implements Reviewer {
  readonly name = 'gemini' as const;
  private client?: GoogleGenAI;

  constructor(private readonly config: ConfigService<Env, true>) {}

  async review(prompt: string): Promise<ReviewerAnswer> {
    const model = this.config.get('GEMINI_MODEL', { infer: true });
    if (!model) throw new ServiceUnavailableException('GEMINI_MODEL is not set');

    const response = await this.genai().models.generateContent({
      model,
      contents: prompt,
      config: {
        systemInstruction: REVIEW_SYSTEM_PROMPT,
        responseMimeType: 'application/json',
        responseJsonSchema: z.toJSONSchema(reviewOutputSchema),
      },
    });

    const text = response.text;
    if (!text) throw new Error(`Gemini returned no text (finish reason: ${response.candidates?.[0]?.finishReason})`);
    // The schema constrains the answer, but it is still validated: a truncated or off-schema reply must not pass as a verdict.
    const output = reviewOutputSchema.parse(JSON.parse(text));
    return {
      output,
      model,
      inputTokens: response.usageMetadata?.promptTokenCount ?? null,
      outputTokens: response.usageMetadata?.candidatesTokenCount ?? null,
    };
  }

  private genai(): GoogleGenAI {
    if (this.client) return this.client;
    const apiKey = this.config.get('GEMINI_API_KEY', { infer: true });
    if (!apiKey) throw new ServiceUnavailableException('GEMINI_API_KEY is not set');
    return (this.client = new GoogleGenAI({ apiKey }));
  }
}
