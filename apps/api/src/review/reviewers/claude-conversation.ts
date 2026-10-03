import type Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { REVIEW_SYSTEM_PROMPT } from '../review-prompt';
import { reviewOutputSchema, type ReviewOutput } from '../review-output';
import { REVIEW_TOOLS } from '../tools/review-tools';
import type { ToolResult } from '../tools/tool-executor';
import type { FinalAnswer, ReviewConversation, Turn, TurnUsage } from '../tools/tool-loop';

type Message = Anthropic.Beta.Messages.BetaMessage;
type MessageParam = Anthropic.Beta.Messages.BetaMessageParam;
type CreateParams = Anthropic.Beta.Messages.MessageCreateParamsNonStreaming;

const TOOLS: Anthropic.Beta.Messages.BetaTool[] = REVIEW_TOOLS.map((tool) => ({
  name: tool.name,
  description: tool.description,
  input_schema: tool.inputSchema as Anthropic.Beta.Messages.BetaTool.InputSchema,
}));

/** Cached and uncached input both count: the budget is about what the review processes. */
function usageOf(message: Message): TurnUsage {
  const { usage } = message;
  return {
    inputTokens: usage.input_tokens + (usage.cache_creation_input_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0),
    outputTokens: usage.output_tokens,
  };
}

const toolResultBlocks = (results: ToolResult[]): Anthropic.Beta.Messages.BetaToolResultBlockParam[] =>
  results.map((r) => ({ type: 'tool_result', tool_use_id: r.id, content: r.content, is_error: r.isError }));

/**
 * Claude's side of a review, as a manual tool loop. The Tool Runner is not used because
 * the loop must be able to stop between turns and demand a verdict with tools off.
 * Assistant turns are sent back exactly as received, which adaptive thinking and
 * policy fallbacks both require.
 */
export class ClaudeConversation implements ReviewConversation {
  private readonly messages: MessageParam[];

  constructor(
    private readonly client: Anthropic,
    private readonly model: string,
    prompt: string,
  ) {
    this.messages = [{ role: 'user', content: prompt }];
  }

  async next(results: ToolResult[]): Promise<Turn> {
    if (results.length > 0) this.messages.push({ role: 'user', content: toolResultBlocks(results) });
    const response = await this.send({});
    const usage = usageOf(response);
    if (response.stop_reason === 'tool_use') {
      const calls = response.content.flatMap((block) =>
        block.type === 'tool_use' ? [{ id: block.id, name: block.name, input: block.input }] : [],
      );
      if (calls.length === 0) throw new Error('Claude stopped for tool use without asking for a tool');
      return { kind: 'tools', calls, usage, model: response.model };
    }
    return { kind: 'answer', output: this.verdict(response), usage, model: response.model };
  }

  async finalize(results: ToolResult[], reason: string): Promise<FinalAnswer> {
    this.messages.push({
      role: 'user',
      content: [
        ...toolResultBlocks(results),
        { type: 'text', text: `${reason}. Tools are switched off now: give your verdict from what you have read.` },
      ],
    });
    const response = await this.send({ tool_choice: { type: 'none' } });
    return { output: this.verdict(response), usage: usageOf(response), model: response.model };
  }

  private async send(extra: Partial<CreateParams>): Promise<Message> {
    const response = await this.client.beta.messages.create({
      model: this.model,
      max_tokens: 16000,
      thinking: { type: 'adaptive' },
      output_config: { effort: 'high', format: zodOutputFormat(reviewOutputSchema) },
      // If the model declines for policy reasons, the API retries on its default fallback.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      // Each turn resends the whole review context; caching it makes later turns cheap.
      cache_control: { type: 'ephemeral' },
      system: REVIEW_SYSTEM_PROMPT,
      tools: TOOLS,
      messages: [...this.messages],
      ...extra,
    });
    this.messages.push({ role: 'assistant', content: response.content });
    return response;
  }

  private verdict(response: Message): ReviewOutput {
    if (response.stop_reason === 'refusal') {
      throw new Error(`Claude refused the review (${response.stop_details?.category ?? 'no category'})`);
    }
    const text = response.content.flatMap((block) => (block.type === 'text' ? [block.text] : [])).join('');
    if (response.stop_reason !== 'end_turn' || text === '') {
      throw new Error(`Claude returned no structured review (stop reason: ${response.stop_reason})`);
    }
    // The format constrains the answer, but it is still validated: an off-schema reply must not pass as a verdict.
    return reviewOutputSchema.parse(JSON.parse(text));
  }
}
