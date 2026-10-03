import { waitForCi, type CiWaitOptions } from './ci-status';
import type { WorkflowRun } from './github-review.client';

const SLUG = { owner: 'acme', repo: 'widgets' };
const run = (over: Partial<WorkflowRun> = {}): WorkflowRun => ({ id: 1, name: 'ci', status: 'completed', conclusion: 'success', ...over });

/** A fake clock: sleeping advances it, so the wait loop runs without real time. */
function setup(polls: WorkflowRun[][], jobs: Record<number, string[]> = {}) {
  let time = 0;
  const options: CiWaitOptions = {
    pollMs: 15_000,
    noRunsAfterMs: 60_000,
    timeoutMs: 600_000,
    sleep: async (ms) => void (time += ms),
    now: () => time,
  };
  let call = 0;
  const client = {
    workflowRuns: jest.fn(async () => polls[Math.min(call++, polls.length - 1)]),
    failedJobNames: jest.fn(async (_slug: unknown, id: number) => jobs[id] ?? []),
  };
  return { client, options, wait: () => waitForCi(client, SLUG, 'sha1', options) };
}

describe('waitForCi', () => {
  it('reports passed when every run succeeded', async () => {
    const { wait } = setup([[run(), run({ id: 2, conclusion: 'skipped' })]]);
    await expect(wait()).resolves.toEqual({ state: 'passed', failedJobs: [] });
  });

  it('keeps polling while a run is in progress', async () => {
    const { wait, client } = setup([[run({ status: 'in_progress', conclusion: null })], [run()]]);
    await expect(wait()).resolves.toEqual({ state: 'passed', failedJobs: [] });
    expect(client.workflowRuns).toHaveBeenCalledTimes(2);
  });

  it('names the failed jobs, falling back to the run name when no job failed', async () => {
    const { wait } = setup(
      [[run({ id: 1, conclusion: 'failure' }), run({ id: 2, name: 'lint', conclusion: 'cancelled' })]],
      { 1: ['test (node 22)'] },
    );
    await expect(wait()).resolves.toEqual({ state: 'failed', failedJobs: ['test (node 22)', 'lint'] });
  });

  it('answers none when no run shows up within the grace period', async () => {
    const { wait, client } = setup([[]]);
    await expect(wait()).resolves.toEqual({ state: 'none', failedJobs: [] });
    expect(client.workflowRuns).toHaveBeenCalledTimes(5);
  });

  it('treats runs that never executed the code as no CI', async () => {
    const { wait } = setup([[run({ conclusion: 'action_required' })]]);
    await expect(wait()).resolves.toEqual({ state: 'none', failedJobs: [] });
  });

  it('gives up after the timeout and says CI was still running', async () => {
    const { wait } = setup([[run({ status: 'queued', conclusion: null })]]);
    await expect(wait()).resolves.toEqual({ state: 'timeout', failedJobs: [] });
  });
});
