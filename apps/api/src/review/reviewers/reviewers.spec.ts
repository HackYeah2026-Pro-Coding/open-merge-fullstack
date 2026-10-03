import type { ConfigService } from '@nestjs/config';
import { ServiceUnavailableException } from '@nestjs/common';
import type { Env } from '../../config/env';
import type { ReviewOutput } from '../review-output';
import { RepoSnapshot } from '../tools/repo-snapshot';
import { repoTarball } from '../tools/tar-fixtures';
import { ReviewToolExecutor } from '../tools/tool-executor';
import { ClaudeReviewer } from './claude.reviewer';
import { GeminiReviewer } from './gemini.reviewer';
import type { ReviewRequest } from './reviewer';

const OUTPUT: ReviewOutput = {
  verdict: 'approve',
  confidence: 'medium',
  criteria: [{ criterion: 'c', status: 'met', evidence: 'src/a.ts:1' }],
  risks: [],
  developerFeedback: 'f',
  maintainerSummary: 's',
};
const NONCE = 'feedfacecafebeef';
const config = (values: Record<string, string | undefined>) =>
  ({ get: (key: string) => values[key] }) as unknown as ConfigService<Env, true>;
/** Swaps in a fake SDK client; the reviewer builds the real one lazily on first use. */
const inject = <T extends object>(reviewer: T, client: unknown): T => Object.assign(reviewer, { client });

async function request(): Promise<ReviewRequest> {
  const snapshot = await RepoSnapshot.fromTarball(repoTarball({ 'src/a.ts': 'export const a = 1;\n' }));
  return { prompt: 'the prompt', tools: new ReviewToolExecutor(async () => snapshot, NONCE) };
}
/** The arguments of each SDK call as sent over the wire, copied when made so later pushes to the transcript do not show up. */
function recorded(results: object[]) {
  const calls: Record<string, unknown>[] = [];
  const fn = jest.fn(async (params: Record<string, unknown>) => {
    calls.push(JSON.parse(JSON.stringify(params)) as Record<string, unknown>);
    const next = results.shift();
    if (!next) throw new Error('no scripted response left');
    return next;
  });
  return { fn, calls };
}

describe('ClaudeReviewer', () => {
  const usage = { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 100, cache_creation_input_tokens: 0 };
  const final = (text = JSON.stringify(OUTPUT)) => ({ model: 'claude-opus-5-5', stop_reason: 'end_turn', content: [{ type: 'text', text }], usage });
  const toolTurn = (...uses: { id: string; input: unknown }[]) => ({
    model: 'claude-opus-5-5',
    stop_reason: 'tool_use',
    content: [{ type: 'thinking', thinking: '', signature: 'sig-1' }, ...uses.map((u) => ({ type: 'tool_use', name: 'read_file', ...u }))],
    usage,
  });
  const reviewer = (...responses: object[]) => {
    const { fn, calls } = recorded(responses);
    const claude = inject(new ClaudeReviewer(config({ CLAUDE_REVIEW_MODEL: 'claude-opus-5-5' })), { beta: { messages: { create: fn } } });
    return { claude, calls };
  };

  it('asks with the shared tools, schema, adaptive thinking, policy fallback and caching, and returns the answer', async () => {
    const { claude, calls } = reviewer(final());
    await expect(claude.review(await request())).resolves.toEqual({
      output: OUTPUT,
      model: 'claude-opus-5-5',
      inputTokens: 110,
      outputTokens: 5,
      sources: [],
    });
    expect(calls[0]).toMatchObject({
      model: 'claude-opus-5-5',
      thinking: { type: 'adaptive' },
      output_config: { effort: 'high', format: { type: 'json_schema' } },
      fallbacks: 'default',
      betas: ['server-side-fallback-2026-07-01'],
      cache_control: { type: 'ephemeral' },
      messages: [{ role: 'user', content: 'the prompt' }],
    });
    expect((calls[0].tools as { name: string }[]).map((t) => t.name)).toEqual(['read_file', 'list_dir', 'search']);
    expect(calls[0].tool_choice).toBeUndefined();
  });

  it('runs the tools Claude asks for and sends its turn back unchanged, followed by the delimited results', async () => {
    const turn = toolTurn({ id: 'tu_1', input: { path: 'src/a.ts' } });
    const { claude, calls } = reviewer(turn, final());
    const answer = await claude.review(await request());
    const [, assistant, results] = calls[1].messages as { role: string; content: unknown }[];
    expect(assistant).toEqual({ role: 'assistant', content: turn.content });
    expect(results).toEqual({
      role: 'user',
      content: [{ type: 'tool_result', tool_use_id: 'tu_1', is_error: false, content: expect.stringContaining(`BEGIN tool_result ${NONCE}`) }],
    });
    expect(answer).toMatchObject({ inputTokens: 220, outputTokens: 10, sources: [{ tool: 'read_file', target: 'src/a.ts', ok: true }] });
  });

  it('switches tools off and demands the verdict once the call limit is passed', async () => {
    const uses = Array.from({ length: 25 }, (_, i) => ({ id: `tu_${i}`, input: { path: 'src/a.ts', startLine: 1, endLine: 1 } }));
    const { claude, calls } = reviewer(toolTurn(...uses), final());
    await expect(claude.review(await request())).resolves.toMatchObject({ output: OUTPUT });
    expect(calls).toHaveLength(2);
    expect(calls[1].tool_choice).toEqual({ type: 'none' });
    const last = (calls[1].messages as { content: { type: string; text?: string; content?: string }[] }[]).at(-1)!;
    expect(last.content).toHaveLength(26);
    expect(last.content[24].content).toMatch(/^Not run/);
    expect(last.content[25]).toEqual({ type: 'text', text: expect.stringContaining('Tools are switched off now') });
  });

  it('fails when the model refuses, naming the category', async () => {
    const { claude } = reviewer({ ...final(), stop_reason: 'refusal', stop_details: { category: 'cyber' }, content: [] });
    await expect(claude.review(await request())).rejects.toThrow('refused the review (cyber)');
  });

  it('fails when no structured answer came back, e.g. the output was cut off', async () => {
    const { claude } = reviewer({ ...final(), stop_reason: 'max_tokens', content: [] });
    await expect(claude.review(await request())).rejects.toThrow('stop reason: max_tokens');
  });

  it('rejects an answer that is not JSON or not in the schema instead of treating it as a verdict', async () => {
    await expect(reviewer(final('{"verdict": "appro')).claude.review(await request())).rejects.toThrow(SyntaxError);
    await expect(reviewer(final(JSON.stringify({ ...OUTPUT, verdict: 'lgtm' }))).claude.review(await request())).rejects.toThrow();
  });

  it('is unavailable without an API key', async () => {
    await expect(new ClaudeReviewer(config({})).review(await request())).rejects.toThrow(ServiceUnavailableException);
  });
});

describe('GeminiReviewer', () => {
  const usageMetadata = { promptTokenCount: 20, candidatesTokenCount: 7, thoughtsTokenCount: 3 };
  const final = (text = JSON.stringify(OUTPUT)) => ({
    candidates: [{ content: { role: 'model', parts: [{ text: 'thinking out loud', thought: true }, { text }] }, finishReason: 'STOP' }],
    usageMetadata,
  });
  const callTurn = (...calls: { id?: string; args: unknown }[]) => ({
    candidates: [
      {
        content: { role: 'model', parts: calls.map((c) => ({ functionCall: { name: 'read_file', ...c }, thoughtSignature: 'sig-1' })) },
        finishReason: 'STOP',
      },
    ],
    usageMetadata,
  });
  const reviewer = (...responses: object[]) => {
    const { fn, calls } = recorded(responses);
    const gemini = inject(new GeminiReviewer(config({ GEMINI_MODEL: 'gemini-x' })), { models: { generateContent: fn } });
    return { gemini, calls };
  };
  type Call = { contents: { role: string; parts: Record<string, unknown>[] }[]; config: Record<string, unknown> };

  it('asks with the shared tools and JSON schema and returns the validated answer, counting thinking as output', async () => {
    const { gemini, calls } = reviewer(final());
    await expect(gemini.review(await request())).resolves.toEqual({
      output: OUTPUT,
      model: 'gemini-x',
      inputTokens: 20,
      outputTokens: 10,
      sources: [],
    });
    const [call] = calls as unknown as Call[];
    expect(call.contents).toEqual([{ role: 'user', parts: [{ text: 'the prompt' }] }]);
    expect(call.config).toMatchObject({
      responseMimeType: 'application/json',
      responseJsonSchema: expect.objectContaining({ type: 'object' }),
      toolConfig: { functionCallingConfig: { mode: 'AUTO' } },
    });
    const [tools] = call.config.tools as { functionDeclarations: { name: string }[] }[];
    expect(tools.functionDeclarations.map((d) => d.name)).toEqual(['read_file', 'list_dir', 'search']);
  });

  it('runs the functions Gemini calls and sends its turn back whole, keeping the thought signature', async () => {
    const turn = callTurn({ id: 'fc_1', args: { path: 'src/a.ts' } }, { args: { path: 'nope.ts' } });
    const { gemini, calls } = reviewer(turn, final());
    const answer = await gemini.review(await request());
    const [, model, results] = (calls as unknown as Call[])[1].contents;
    expect(model).toEqual(turn.candidates[0].content);
    expect(results.parts).toEqual([
      { functionResponse: { id: 'fc_1', name: 'read_file', response: { output: expect.stringContaining(`BEGIN tool_result ${NONCE}`) } } },
      { functionResponse: { id: 'call_1', name: 'read_file', response: { error: expect.stringContaining('No file "nope.ts"') } } },
    ]);
    expect(answer.sources).toEqual([
      { tool: 'read_file', target: 'src/a.ts', ok: true },
      { tool: 'read_file', target: 'nope.ts', ok: false },
    ]);
  });

  it('switches function calling off and demands the verdict once the call limit is passed', async () => {
    const many = Array.from({ length: 25 }, (_, i) => ({ id: `fc_${i}`, args: { path: 'src/a.ts', startLine: 1, endLine: 1 } }));
    const { gemini, calls } = reviewer(callTurn(...many), final());
    await gemini.review(await request());
    const last = (calls as unknown as Call[])[1];
    expect(last.config.toolConfig).toEqual({ functionCallingConfig: { mode: 'NONE' } });
    expect(last.contents.at(-1)!.parts.at(-1)).toEqual({ text: expect.stringContaining('Tools are switched off now') });
  });

  it('fails when Gemini still calls a function after tools were switched off', async () => {
    const many = Array.from({ length: 25 }, (_, i) => ({ id: `fc_${i}`, args: { path: 'src/a.ts' } }));
    const { gemini } = reviewer(callTurn(...many), callTurn({ id: 'again', args: { path: 'src/a.ts' } }));
    await expect(gemini.review(await request())).rejects.toThrow('asked for tools after they were switched off');
  });

  it('rejects a reply that is not valid JSON or not in the schema', async () => {
    await expect(reviewer(final('{"verdict": "appro')).gemini.review(await request())).rejects.toThrow(SyntaxError);
    await expect(reviewer(final(JSON.stringify({ ...OUTPUT, verdict: 'lgtm' }))).gemini.review(await request())).rejects.toThrow();
  });

  it('rejects an empty reply and names the finish reason', async () => {
    const { gemini } = reviewer({ candidates: [{ finishReason: 'SAFETY' }] });
    await expect(gemini.review(await request())).rejects.toThrow('SAFETY');
  });

  it('retries a busy model instead of failing the review on the first 503', async () => {
    const fetchMock = jest.spyOn(globalThis, 'fetch');
    try {
      fetchMock
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ error: { code: 503, message: 'high demand', status: 'UNAVAILABLE' } }), { status: 503 }),
        )
        .mockResolvedValueOnce(new Response(JSON.stringify(final()), { status: 200 }));
      const gemini = new GeminiReviewer(config({ GEMINI_MODEL: 'gemini-x', GEMINI_API_KEY: 'k' }));
      await expect(gemini.review(await request())).resolves.toMatchObject({ output: OUTPUT, inputTokens: 20 });
      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally {
      fetchMock.mockRestore();
    }
  }, 15_000);

  it('is unavailable without a model name or an API key', async () => {
    await expect(new GeminiReviewer(config({ GEMINI_API_KEY: 'k' })).review(await request())).rejects.toThrow('GEMINI_MODEL');
    await expect(new GeminiReviewer(config({ GEMINI_MODEL: 'm' })).review(await request())).rejects.toThrow(ServiceUnavailableException);
  });
});
