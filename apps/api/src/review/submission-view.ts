import type { Submission } from '@escrow/shared';
import type { PullRequest, Review, ReviewerResult } from '../generated/prisma/client';
import { toCommitCheck } from './check-view';

/** Loads a pull request's reviews in the shape toSubmission reads, newest first. */
export const submissionInclude = {
  reviews: { include: { results: true }, orderBy: { createdAt: 'desc' } },
} as const;

export type PullRequestWithReviews = PullRequest & { reviews: (Review & { results: ReviewerResult[] })[] };

/** A pull request as the app shows it, with the review of its current head commit. */
export function toSubmission(pr: PullRequestWithReviews): Submission {
  // Reviews are listed newest first; the one for the current head commit is what the app shows.
  const review = pr.reviews.find((r) => r.headSha === pr.headSha);
  const check = toCommitCheck(review);
  return {
    id: pr.id,
    prNumber: pr.number,
    title: pr.title,
    url: pr.url,
    author: { login: pr.authorLogin, avatarUrl: pr.authorAvatarUrl },
    state: pr.state,
    headSha: pr.headSha,
    check,
    ci: review?.ciState ? { state: review.ciState, failedJobs: review.failedJobs } : null,
    retryableReviewId: review && check.state === 'error' ? review.id : null,
    reviewedAt: review?.completedAt?.toISOString() ?? null,
    openedAt: pr.openedAt.toISOString(),
    updatedAt: pr.updatedAt.toISOString(),
  };
}
