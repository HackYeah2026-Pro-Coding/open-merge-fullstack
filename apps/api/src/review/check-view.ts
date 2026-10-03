import type { CheckState, CommitCheck, CriterionStatus, ReviewerVerdict } from '@escrow/shared';
import type { Review, ReviewerResult } from '../generated/prisma/client';
import { reviewOutputSchema } from './review-output';
import { overallState } from './verdict';

const DISPLAY_NAME: Record<string, string> = { claude: 'Claude', gemini: 'Gemini' };

/** Both reviewers are always listed so the dual pill keeps its two halves while one is still working. */
const REVIEWERS = ['claude', 'gemini'] as const;

type Run = Review & { results: ReviewerResult[] };

function toVerdict(reviewer: string, result: ReviewerResult | undefined, status: Review['status']): ReviewerVerdict {
  const reviewerName = DISPLAY_NAME[reviewer] ?? reviewer;
  const empty = { model: null, confidence: null, criteria: [], risks: [] };
  if (!result) {
    // No result row: still running, or the whole run failed before this reviewer answered.
    return status === 'failed'
      ? { reviewer: reviewerName, verdict: 'error', summary: null, ...empty }
      : { reviewer: reviewerName, verdict: 'pending', summary: null, ...empty };
  }
  if (result.output === null) {
    return { reviewer: reviewerName, verdict: 'error', summary: result.error, ...empty, model: result.model };
  }
  // Stored by this service from a validated answer; a failure here means the row was edited by hand.
  const output = reviewOutputSchema.parse(result.output);
  return {
    reviewer: reviewerName,
    verdict: output.verdict,
    summary: output.maintainerSummary,
    model: result.model,
    confidence: output.confidence,
    criteria: output.criteria.map((c) => ({ ...c, status: c.status as CriterionStatus })),
    risks: output.risks,
  };
}

/** The check shown on a submission, from the latest review run of its head commit. */
export function toCommitCheck(review: Run | undefined): CommitCheck {
  if (!review) return { state: 'not_run', reviewers: [] };
  const reviewers = REVIEWERS.map((name) =>
    toVerdict(name, review.results.find((r) => r.reviewer === name), review.status),
  );
  return { state: checkState(review, reviewers), reviewers };
}

function checkState(review: Run, reviewers: ReviewerVerdict[]): CheckState {
  if (review.status === 'pending') return 'pending';
  if (review.status === 'failed') return 'error';
  const verdicts = reviewers.map((v) => (v.verdict === 'approve' || v.verdict === 'changes' ? v.verdict : null));
  return overallState(verdicts, review.ciState ?? 'none');
}
