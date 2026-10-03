import type { CheckState, CommitCheck, CriterionStatus, ReviewSource, ReviewerVerdict } from '@escrow/shared';
import { z } from 'zod';
import type { Review, ReviewerResult } from '../generated/prisma/client';
import { REVIEWER_DISPLAY_NAME, reviewOutputSchema, reviewSourceSchema } from './review-output';
import { overallState } from './verdict';

/** Both reviewers are always listed so the dual pill keeps its two halves while one is still working. */
const REVIEWERS = ['claude', 'gemini'] as const;

type Run = Review & { results: ReviewerResult[] };

/** Rows from before the tools existed, and failed reviewers, have no sources. */
const sourcesOf = (result: ReviewerResult): ReviewSource[] =>
  result.sources === null ? [] : z.array(reviewSourceSchema).parse(result.sources);

function toVerdict(reviewer: string, result: ReviewerResult | undefined, review: Run): ReviewerVerdict {
  const reviewerName = REVIEWER_DISPLAY_NAME[reviewer] ?? reviewer;
  const empty = { model: null, confidence: null, criteria: [], risks: [], sources: [] };
  if (!result) {
    // No result row: still running, or the whole run failed before this reviewer answered, which the run's error explains.
    return review.status === 'failed'
      ? { reviewer: reviewerName, verdict: 'error', summary: review.error, ...empty }
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
    sources: sourcesOf(result),
  };
}

/** The check shown on a submission, from the latest review run of its head commit. */
export function toCommitCheck(review: Run | undefined): CommitCheck {
  if (!review) return { state: 'not_run', reviewers: [] };
  const reviewers = REVIEWERS.map((name) =>
    toVerdict(name, review.results.find((r) => r.reviewer === name), review),
  );
  return { state: checkState(review, reviewers), reviewers };
}

function checkState(review: Run, reviewers: ReviewerVerdict[]): CheckState {
  if (review.status === 'pending') return 'pending';
  if (review.status === 'failed') return 'error';
  const verdicts = reviewers.map((v) => (v.verdict === 'approve' || v.verdict === 'changes' ? v.verdict : null));
  return overallState(verdicts, review.ciState ?? 'none');
}
