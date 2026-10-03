import type { GithubApi } from './github-api';
import type { Log } from './log';

/**
 * Name of the commit status the AI review sets. Mirrors STATUS_CONTEXT in
 * src/review/github-review.client.ts, which this CLI does not import because it pulls in the Nest
 * stack; review-status.spec.ts fails if they drift apart.
 */
export const REVIEW_STATUS_CONTEXT = 'OpenMerge / AI review';

export interface ReviewStatus {
  state: 'pending' | 'success' | 'failure' | 'error';
  description: string | null;
}

export interface WaitOptions {
  pollMs: number;
  timeoutMs: number;
  sleep: (ms: number) => Promise<void>;
  now: () => number;
}

export const DEFAULT_WAIT: WaitOptions = {
  pollMs: 5_000,
  timeoutMs: 10 * 60_000,
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  now: () => Date.now(),
};

/** The AI review's status on a commit, or null when it has not been set yet. */
export async function reviewStatusOf(api: GithubApi, base: string, sha: string): Promise<ReviewStatus | null> {
  // Newest first, so the first match is the current one.
  const statuses = await api.request<(ReviewStatus & { context: string })[]>('GET', `${base}/commits/${sha}/statuses`);
  const found = statuses.find((status) => status.context === REVIEW_STATUS_CONTEXT);
  return found ? { state: found.state, description: found.description } : null;
}

/** Polls until the review of a commit is no longer pending. */
export async function waitForReview(
  api: GithubApi,
  base: string,
  sha: string,
  options: WaitOptions,
  log: Log,
): Promise<ReviewStatus> {
  const start = options.now();
  let announced = false;
  for (;;) {
    const status = await reviewStatusOf(api, base, sha);
    if (status && status.state !== 'pending') return status;
    if (options.now() - start >= options.timeoutMs) {
      throw new Error(`The review of ${sha.slice(0, 7)} did not finish within ${Math.round(options.timeoutMs / 1000)}s`);
    }
    if (!announced) {
      log(status ? `Review of ${sha.slice(0, 7)} is running...` : `Waiting for the review of ${sha.slice(0, 7)} to start...`);
      announced = true;
    }
    await options.sleep(options.pollMs);
  }
}
