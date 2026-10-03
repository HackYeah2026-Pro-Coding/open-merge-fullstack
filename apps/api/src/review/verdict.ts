import type { CiState } from '../generated/prisma/enums';
import type { ReviewOutput, ReviewerAnswer, ReviewerName } from './review-output';

/** Outcome of one reviewer: an answer, or the reason it produced none. */
export type ReviewerOutcome =
  | { reviewer: ReviewerName; ok: true; answer: ReviewerAnswer }
  | { reviewer: ReviewerName; ok: false; error: string };

/** Commit status states GitHub accepts. */
export type CommitStatusState = 'success' | 'failure' | 'error';

/**
 * Overall result of a review run.
 *   error   a reviewer produced no answer, so there is nothing trustworthy to show
 *   failed  CI is red, or any reviewer asks for changes
 *   passed  every reviewer approves and CI did not fail
 * CI that is missing or timed out does not fail a review; it is reported next to it.
 */
export function overallState(
  verdicts: (ReviewOutput['verdict'] | null)[],
  ci: CiState,
): 'passed' | 'failed' | 'error' {
  if (verdicts.some((v) => v === null)) return 'error';
  if (ci === 'failed') return 'failed';
  return verdicts.every((v) => v === 'approve') ? 'passed' : 'failed';
}

/** The verdict of an outcome, or null when the reviewer gave no answer. */
export const verdictOf = (outcome: ReviewerOutcome): ReviewOutput['verdict'] | null =>
  outcome.ok ? outcome.answer.output.verdict : null;

export function toCommitStatus(state: 'passed' | 'failed' | 'error'): CommitStatusState {
  return state === 'passed' ? 'success' : state === 'failed' ? 'failure' : 'error';
}
