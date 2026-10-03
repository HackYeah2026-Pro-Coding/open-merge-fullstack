import type { ReviewerAnswer, ReviewerName } from '../review-output';

/** One model that reads the review prompt and answers in the shared structure. */
export interface Reviewer {
  readonly name: ReviewerName;
  review(prompt: string): Promise<ReviewerAnswer>;
}

/** Nest injection token for the list of reviewers a run fans out to. */
export const REVIEWERS = Symbol('REVIEWERS');
