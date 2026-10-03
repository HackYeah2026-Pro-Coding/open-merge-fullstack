import type { ReviewerAnswer, ReviewerName } from '../review-output';
import type { ReviewToolExecutor } from '../tools/tool-executor';

/** What every reviewer gets: the same prompt, and its own executor over the same repository snapshot. */
export interface ReviewRequest {
  prompt: string;
  tools: ReviewToolExecutor;
}

/** One model that reads the review prompt, may read the repository, and answers in the shared structure. */
export interface Reviewer {
  readonly name: ReviewerName;
  review(request: ReviewRequest): Promise<ReviewerAnswer>;
}

/** Nest injection token for the list of reviewers a run fans out to. */
export const REVIEWERS = Symbol('REVIEWERS');
