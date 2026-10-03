import type { CiState } from '../generated/prisma/enums';
import type { GithubReviewClient, RepoSlug, WorkflowRun } from './github-review.client';

export interface CiResult {
  state: CiState;
  failedJobs: string[];
}

export interface CiWaitOptions {
  pollMs: number;
  /** How long to wait for a first workflow run to appear before deciding the repo has no CI. */
  noRunsAfterMs: number;
  timeoutMs: number;
  sleep: (ms: number) => Promise<void>;
  now: () => number;
}

export const DEFAULT_CI_WAIT: CiWaitOptions = {
  pollMs: 15_000,
  noRunsAfterMs: 60_000,
  timeoutMs: 10 * 60_000,
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  now: () => Date.now(),
};

const FAILED = new Set(['failure', 'timed_out', 'cancelled', 'startup_failure']);
/** Conclusions that say nothing about the code: the run never executed it. */
const NOT_EXECUTED = new Set(['action_required', 'skipped', 'stale']);

/** Runs that wait for a human (e.g. a first-time contributor's) complete as `action_required`, so they are not waited for. */
const isSettled = (run: WorkflowRun) => run.status === 'completed';

/**
 * Waits for the GitHub Actions runs of one commit and reports how they ended.
 * "none" means the repository produced no run; "timeout" means runs were still going
 * when the wait ran out. Neither blocks the review.
 */
export async function waitForCi(
  client: Pick<GithubReviewClient, 'workflowRuns' | 'failedJobNames'>,
  slug: RepoSlug,
  headSha: string,
  options: CiWaitOptions = DEFAULT_CI_WAIT,
): Promise<CiResult> {
  const start = options.now();
  for (;;) {
    const runs = await client.workflowRuns(slug, headSha);
    const elapsed = options.now() - start;

    if (runs.length === 0 && elapsed >= options.noRunsAfterMs) return { state: 'none', failedJobs: [] };
    if (runs.length > 0 && runs.every(isSettled)) return summarise(client, slug, runs);
    if (elapsed >= options.timeoutMs) return { state: 'timeout', failedJobs: [] };

    await options.sleep(options.pollMs);
  }
}

async function summarise(
  client: Pick<GithubReviewClient, 'failedJobNames'>,
  slug: RepoSlug,
  runs: WorkflowRun[],
): Promise<CiResult> {
  const executed = runs.filter((r) => r.conclusion === null || !NOT_EXECUTED.has(r.conclusion));
  if (executed.length === 0) return { state: 'none', failedJobs: [] };
  const failedRuns = executed.filter((r) => r.conclusion !== null && FAILED.has(r.conclusion));
  if (failedRuns.length === 0) return { state: 'passed', failedJobs: [] };
  const jobs = await Promise.all(failedRuns.map((r) => client.failedJobNames(slug, r.id)));
  // A run can fail without any job failing (cancelled, startup failure); fall back to its name.
  const names = failedRuns.flatMap((r, i) => (jobs[i].length > 0 ? jobs[i] : [r.name ?? `run ${r.id}`]));
  return { state: 'failed', failedJobs: [...new Set(names)] };
}
