import type { ReviewSource } from '@escrow/shared';
import type { ReviewOutput } from '../review-output';
import type { ReviewToolExecutor, ToolCall, ToolResult } from './tool-executor';

export interface LoopLimits {
  /** Model requests per reviewer, the final one included. */
  maxTurns: number;
  maxToolCalls: number;
  /** Input plus output tokens per reviewer, summed over every request. */
  tokenBudget: number;
}

export const DEFAULT_LIMITS: LoopLimits = { maxTurns: 10, maxToolCalls: 24, tokenBudget: 400_000 };

export interface TurnUsage {
  inputTokens: number;
  outputTokens: number;
}

/** What the model did in one request: asked for tools, or gave its verdict. */
export type Turn =
  | { kind: 'tools'; calls: ToolCall[]; usage: TurnUsage; model: string }
  | { kind: 'answer'; output: ReviewOutput; usage: TurnUsage; model: string };

export interface FinalAnswer {
  output: ReviewOutput;
  usage: TurnUsage;
  model: string;
}

/** One model's side of a review. Each provider keeps its own transcript; the loop only drives it. */
export interface ReviewConversation {
  /** Sends the results of the previous tool turn (none on the first request) and returns what the model does next. */
  next(results: ToolResult[]): Promise<Turn>;
  /** Sends the last results with tools switched off and demands the verdict. Rejects when none comes back. */
  finalize(results: ToolResult[], reason: string): Promise<FinalAnswer>;
}

export interface LoopResult {
  output: ReviewOutput;
  model: string;
  inputTokens: number;
  outputTokens: number;
  sources: ReviewSource[];
}

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error));

const notRun = (call: ToolCall): ToolResult => ({
  id: call.id,
  name: call.name,
  content: 'Not run: the tool limit for this review is reached.',
  isError: true,
});

/**
 * Lets the model read the repository until it answers or a limit is reached. A limit
 * never ends the review silently: the model is asked for its verdict with tools off,
 * and if it still gives none the review fails with an error that says why.
 */
export async function runToolLoop(
  conversation: ReviewConversation,
  tools: ReviewToolExecutor,
  limits: LoopLimits = DEFAULT_LIMITS,
): Promise<LoopResult> {
  const usage: TurnUsage = { inputTokens: 0, outputTokens: 0 };
  const count = (turn: TurnUsage) => {
    usage.inputTokens += turn.inputTokens;
    usage.outputTokens += turn.outputTokens;
  };
  const result = (answer: FinalAnswer): LoopResult => ({ output: answer.output, model: answer.model, ...usage, sources: tools.sources });

  let results: ToolResult[] = [];
  let callsMade = 0;
  for (let turn = 1; ; turn++) {
    const next = await conversation.next(results);
    count(next.usage);
    if (next.kind === 'answer') return result(next);

    const overBudget = usage.inputTokens + usage.outputTokens >= limits.tokenBudget;
    const allowed = overBudget ? 0 : Math.max(0, limits.maxToolCalls - callsMade);
    results = [];
    // One at a time, so the output budget is spent in the order the model asked.
    for (const [i, call] of next.calls.entries()) results.push(i < allowed ? await tools.run(call) : notRun(call));
    callsMade += Math.min(allowed, next.calls.length);

    const reason = overBudget
      ? `The budget of ${limits.tokenBudget} tokens is used up`
      : next.calls.length > allowed
        ? `The limit of ${limits.maxToolCalls} tool calls is reached`
        : turn + 1 >= limits.maxTurns
          ? `The limit of ${limits.maxTurns} requests is reached`
          : null;
    if (reason === null) continue;

    try {
      const final = await conversation.finalize(results, reason);
      count(final.usage);
      return result(final);
    } catch (error) {
      throw new Error(`${reason}, and the model then gave no verdict: ${errorMessage(error)}`, { cause: error });
    }
  }
}
