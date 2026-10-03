import type { ConfigService } from '@nestjs/config';
import { ServiceUnavailableException } from '@nestjs/common';
import type { Env } from '../../config/env';
import type { ReviewOutput } from '../review-output';
import { ClaudeReviewer } from './claude.reviewer';
import { GeminiReviewer } from './gemini.reviewer';

const OUTPUT: ReviewOutput = {
  verdict: 'approve',
  confidence: 'medium',
  criteria: [{ criterion: 'c', status: 'met', evidence: 'src/a.ts:1' }],
  risks: [],
  developerFeedback: 'f',
  maintainerSummary: 's',
};
const config = (values: Record<string, string | undefined>) =>
  ({ get: (key: string) => values[key] }) as unknown as ConfigService<Env, true>;
/** Swaps in a fake SDK client; the reviewer builds the real one lazily on first use. */
const inject = <T extends object>(reviewer: T, client: unknown): T => Object.assign(reviewer, { client });

describe('ClaudeReviewer', () => {
  const reviewer = (message: object) => {
    const parse = jest.fn().mockResolvedValue({ model: 'claude-opus-5-5', usage: { input_tokens: 10, output_tokens: 5 }, ...message });
    return { reviewer: inject(new ClaudeReviewer(config({ CLAUDE_REVIEW_MODEL: 'claude-opus-5-5' })), { beta: { messages: { parse } } }), parse };
  };

  it('asks for the shared structure with adaptive thinking and policy fallback, and returns the parsed answer', async () => {
    const { reviewer: claude, parse } = reviewer({ stop_reason: 'end_turn', parsed_output: OUTPUT });
    await expect(claude.review('the prompt')).resolves.toEqual({
      output: OUTPUT,
      model: 'claude-opus-5-5',
      inputTokens: 10,
      outputTokens: 5,
    });
    expect(parse).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'claude-opus-5-5',
        thinking: { type: 'adaptive' },
        fallbacks: 'default',
        betas: ['server-side-fallback-2026-07-01'],
        messages: [{ role: 'user', content: 'the prompt' }],
      }),
    );
  });

  it('fails when the model refuses, naming the category', async () => {
    const { reviewer: claude } = reviewer({ stop_reason: 'refusal', stop_details: { category: 'cyber' }, parsed_output: null });
    await expect(claude.review('p')).rejects.toThrow('refused the review (cyber)');
  });

  it('fails when no structured answer came back, e.g. the output was cut off', async () => {
    const { reviewer: claude } = reviewer({ stop_reason: 'max_tokens', parsed_output: null });
    await expect(claude.review('p')).rejects.toThrow('stop reason: max_tokens');
  });

  it('is unavailable without an API key', async () => {
    await expect(new ClaudeReviewer(config({})).review('p')).rejects.toThrow(ServiceUnavailableException);
  });
});

describe('GeminiReviewer', () => {
  const reviewer = (response: object) => {
    const generateContent = jest.fn().mockResolvedValue(response);
    return {
      reviewer: inject(new GeminiReviewer(config({ GEMINI_MODEL: 'gemini-x' })), { models: { generateContent }  }),
      generateContent,
    };
  };

  it('asks for JSON in the shared schema and returns the validated answer', async () => {
    const { reviewer: gemini, generateContent } = reviewer({
      text: JSON.stringify(OUTPUT),
      usageMetadata: { promptTokenCount: 20, candidatesTokenCount: 7 },
    });
    await expect(gemini.review('the prompt')).resolves.toEqual({ output: OUTPUT, model: 'gemini-x', inputTokens: 20, outputTokens: 7 });
    expect(generateContent).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'gemini-x',
        contents: 'the prompt',
        config: expect.objectContaining({ responseMimeType: 'application/json', responseJsonSchema: expect.objectContaining({ type: 'object' }) }),
      }),
    );
  });

  it('rejects a reply that is not valid JSON', async () => {
    const { reviewer: gemini } = reviewer({ text: '{"verdict": "appro' });
    await expect(gemini.review('p')).rejects.toThrow(SyntaxError);
  });

  it('rejects JSON that does not match the schema instead of treating it as a verdict', async () => {
    const { reviewer: gemini } = reviewer({ text: JSON.stringify({ ...OUTPUT, verdict: 'lgtm' }) });
    await expect(gemini.review('p')).rejects.toThrow();
  });

  it('rejects an empty reply and names the finish reason', async () => {
    const { reviewer: gemini } = reviewer({ text: undefined, candidates: [{ finishReason: 'SAFETY' }] });
    await expect(gemini.review('p')).rejects.toThrow('SAFETY');
  });

  it('retries a busy model instead of failing the review on the first 503', async () => {
    const fetchMock = jest.spyOn(globalThis, 'fetch');
    try {
      fetchMock
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ error: { code: 503, message: 'high demand', status: 'UNAVAILABLE' } }), { status: 503 }),
        )
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              candidates: [{ content: { role: 'model', parts: [{ text: JSON.stringify(OUTPUT) }] }, finishReason: 'STOP' }],
              usageMetadata: { promptTokenCount: 3, candidatesTokenCount: 2 },
            }),
            { status: 200 },
          ),
        );
      const gemini = new GeminiReviewer(config({ GEMINI_MODEL: 'gemini-x', GEMINI_API_KEY: 'k' }));
      await expect(gemini.review('p')).resolves.toMatchObject({ output: OUTPUT, inputTokens: 3 });
      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally {
      fetchMock.mockRestore();
    }
  }, 15_000);

  it('is unavailable without a model name or an API key', async () => {
    await expect(new GeminiReviewer(config({ GEMINI_API_KEY: 'k' })).review('p')).rejects.toThrow('GEMINI_MODEL');
    await expect(new GeminiReviewer(config({ GEMINI_MODEL: 'm' })).review('p')).rejects.toThrow(ServiceUnavailableException);
  });
});
