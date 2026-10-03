import { FunctionCallingConfigMode, type Content, type GenerateContentResponse, type GoogleGenAI, type Part } from '@google/genai';
import { z } from 'zod';
import { REVIEW_SYSTEM_PROMPT } from '../review-prompt';
import { reviewOutputSchema } from '../review-output';
import { REVIEW_TOOLS } from '../tools/review-tools';
import type { ToolCall, ToolResult } from '../tools/tool-executor';
import type { FinalAnswer, ReviewConversation, Turn, TurnUsage } from '../tools/tool-loop';

const FUNCTION_DECLARATIONS = REVIEW_TOOLS.map((tool) => ({
  name: tool.name,
  description: tool.description,
  parametersJsonSchema: tool.inputSchema,
}));
const RESPONSE_SCHEMA = z.toJSONSchema(reviewOutputSchema);

/** Thinking is billed as output, so it counts towards the budget like Claude's does. */
function usageOf(response: GenerateContentResponse): TurnUsage {
  const usage = response.usageMetadata;
  return {
    inputTokens: usage?.promptTokenCount ?? 0,
    outputTokens: (usage?.candidatesTokenCount ?? 0) + (usage?.thoughtsTokenCount ?? 0),
  };
}

const responseParts = (results: ToolResult[]): Part[] =>
  results.map((r) => ({
    functionResponse: { id: r.id, name: r.name, response: r.isError ? { error: r.content } : { output: r.content } },
  }));

/**
 * Gemini's side of a review. Function calling and the JSON response schema are sent
 * together, so the final turn is the structured verdict. Model turns are sent back
 * whole, which keeps the thought signatures Gemini needs between function calls.
 */
export class GeminiConversation implements ReviewConversation {
  private readonly contents: Content[];
  private calls = 0;

  constructor(
    private readonly genai: GoogleGenAI,
    private readonly model: string,
    prompt: string,
  ) {
    this.contents = [{ role: 'user', parts: [{ text: prompt }] }];
  }

  next(results: ToolResult[]): Promise<Turn> {
    if (results.length > 0) this.contents.push({ role: 'user', parts: responseParts(results) });
    return this.send(FunctionCallingConfigMode.AUTO);
  }

  async finalize(results: ToolResult[], reason: string): Promise<FinalAnswer> {
    this.contents.push({
      role: 'user',
      parts: [...responseParts(results), { text: `${reason}. Tools are switched off now: give your verdict from what you have read.` }],
    });
    const turn = await this.send(FunctionCallingConfigMode.NONE);
    if (turn.kind === 'tools') throw new Error('Gemini asked for tools after they were switched off');
    return turn;
  }

  private async send(mode: FunctionCallingConfigMode): Promise<Turn> {
    const response = await this.genai.models.generateContent({
      model: this.model,
      contents: [...this.contents],
      config: {
        systemInstruction: REVIEW_SYSTEM_PROMPT,
        tools: [{ functionDeclarations: FUNCTION_DECLARATIONS }],
        toolConfig: { functionCallingConfig: { mode } },
        responseMimeType: 'application/json',
        responseJsonSchema: RESPONSE_SCHEMA,
      },
    });
    const usage = usageOf(response);
    const candidate = response.candidates?.[0];
    const parts = candidate?.content?.parts ?? [];
    if (candidate?.content) this.contents.push(candidate.content);

    const calls: ToolCall[] = parts.flatMap((part) =>
      part.functionCall ? [{ id: part.functionCall.id ?? `call_${++this.calls}`, name: part.functionCall.name ?? '', input: part.functionCall.args ?? {} }] : [],
    );
    if (calls.length > 0) return { kind: 'tools', calls, usage, model: this.model };

    const text = parts.flatMap((part) => (part.text && !part.thought ? [part.text] : [])).join('');
    if (!text) throw new Error(`Gemini returned no text (finish reason: ${candidate?.finishReason ?? 'none'})`);
    // The schema constrains the answer, but it is still validated: a truncated or off-schema reply must not pass as a verdict.
    return { kind: 'answer', output: reviewOutputSchema.parse(JSON.parse(text)), usage, model: this.model };
  }
}
