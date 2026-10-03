import type { ReviewSource } from '@escrow/shared';
import { z } from 'zod';

/** The structured answer both reviewers must give. Shared so their verdicts are comparable. */
export const criterionSchema = z.object({
  criterion: z.string().describe('One acceptance criterion derived from the issue, in a short sentence.'),
  status: z.enum(['met', 'not_met', 'unknown']),
  evidence: z
    .string()
    .describe('Where the code or CI result shows this, as file:line or a CI job name. Say what is missing if unknown.'),
});

export const reviewOutputSchema = z.object({
  verdict: z.enum(['approve', 'changes']),
  confidence: z.enum(['low', 'medium', 'high']),
  criteria: z.array(criterionSchema),
  risks: z.array(z.string()).describe('Concrete problems or regressions the change could cause. Empty if none.'),
  developerFeedback: z
    .string()
    .describe('Markdown addressed to the pull request author: what is done, what still has to change.'),
  maintainerSummary: z.string().describe('One or two plain sentences for the project owner deciding whether to merge.'),
});

export type ReviewOutput = z.infer<typeof reviewOutputSchema>;
export type Criterion = z.infer<typeof criterionSchema>;
export type ReviewerName = 'claude' | 'gemini';

/** How each reviewer is named wherever people read it: the app, the PR comment, the commit status. */
export const REVIEWER_DISPLAY_NAME: Record<string, string> = { claude: 'Claude', gemini: 'Gemini' };

/** A tool call as stored with a reviewer's result; validated again when read back. */
export const reviewSourceSchema = z.object({
  tool: z.enum(['read_file', 'search', 'list_dir']),
  target: z.string(),
  ok: z.boolean(),
}) satisfies z.ZodType<ReviewSource>;

/** What a reviewer returns on success, with the cost data worth keeping. */
export interface ReviewerAnswer {
  output: ReviewOutput;
  model: string;
  /** Summed over every request of the review, cached input included. */
  inputTokens: number | null;
  outputTokens: number | null;
  /** The repository reads the verdict rests on, as the server recorded them. */
  sources: ReviewSource[];
}
