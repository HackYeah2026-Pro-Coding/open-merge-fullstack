import type { PrismaService } from '../prisma/prisma.service';
import type { CiWaitOptions } from './ci-status';
import type { GithubReviewClient } from './github-review.client';
import { ReviewRunner } from './review.runner';
import type { ReviewOutput, ReviewerAnswer } from './review-output';
import type { Reviewer, ReviewRequest } from './reviewers/reviewer';
import { repoTarball } from './tools/tar-fixtures';

const REVIEW = {
  id: 'rev_1',
  headSha: 'sha1',
  pullRequest: {
    number: 12,
    githubRepo: { githubRepoName: 'acme/widgets' },
    issue: { githubIssueNumber: 7, title: 'Fix login', body: 'Trailing space breaks login.' },
  },
};
const FILE = { filename: 'src/login.ts', status: 'modified', patch: '@@ -1 +1 @@\n-a\n+b', changes: 2 };
const NO_WAIT: CiWaitOptions = { pollMs: 0, noRunsAfterMs: 0, timeoutMs: 0, sleep: async () => undefined, now: () => 0 };

const answer = (verdict: 'approve' | 'changes', model: string): ReviewerAnswer => {
  const output: ReviewOutput = {
    verdict,
    confidence: 'high',
    criteria: [],
    risks: [],
    developerFeedback: `feedback from ${model}`,
    maintainerSummary: 'summary',
  };
  return { output, model, inputTokens: 100, outputTokens: 50, sources: [] };
};
type Answer = (request: ReviewRequest) => Promise<ReviewerAnswer>;
const reviewer = (name: 'claude' | 'gemini', result: Answer): Reviewer & { review: jest.Mock } => ({
  name,
  review: jest.fn(result),
});
const requestOf = (r: { review: jest.Mock }): ReviewRequest => r.review.mock.calls[0][0];

function setup(options: { claude?: Answer; gemini?: Answer } = {}) {
  const queries = {
    reviewerResult: { deleteMany: jest.fn().mockReturnValue('delete'), createMany: jest.fn().mockReturnValue('create') },
    review: { findUniqueOrThrow: jest.fn().mockResolvedValue(REVIEW), update: jest.fn().mockReturnValue('update') },
    $transaction: jest.fn().mockResolvedValue([]),
  };
  const github = {
    setStatus: jest.fn().mockResolvedValue(undefined),
    workflowRuns: jest.fn().mockResolvedValue([{ id: 1, name: 'ci', status: 'completed', conclusion: 'success' }]),
    failedJobNames: jest.fn().mockResolvedValue([]),
    getPullRequest: jest.fn().mockResolvedValue({ title: 'fix: trim', body: 'Fixes #7', headSha: 'sha1' }),
    listFiles: jest.fn().mockResolvedValue([FILE]),
    fileContent: jest.fn().mockResolvedValue('export const login = 1;'),
    upsertComment: jest.fn().mockResolvedValue(undefined),
    tarball: jest.fn().mockResolvedValue(repoTarball({ 'src/login.ts': 'export const login = 1;', 'src/login.test.ts': 'test(login)' })),
  };
  const claude = reviewer('claude', options.claude ?? (async () => answer('approve', 'claude-m')));
  const gemini = reviewer('gemini', options.gemini ?? (async () => answer('approve', 'gemini-m')));
  const runner = new ReviewRunner(
    queries as unknown as PrismaService,
    github as unknown as GithubReviewClient,
    [claude, gemini],
    NO_WAIT,
  );
  return { runner, queries, github, claude, gemini };
}

const savedResults = (queries: ReturnType<typeof setup>['queries']) => queries.reviewerResult.createMany.mock.calls[0][0].data;
const savedReview = (queries: ReturnType<typeof setup>['queries']) =>
  queries.review.update.mock.calls.find(([arg]) => arg.data.status === 'completed')?.[0].data;

describe('ReviewRunner', () => {
  it('waits for CI, asks both models the same question, saves both answers and publishes the result', async () => {
    const { runner, queries, github, claude, gemini } = setup();
    await runner.run('rev_1');

    expect(github.setStatus.mock.calls.map(([, sha, s]) => [sha, s.state])).toEqual([
      ['sha1', 'pending'],
      ['sha1', 'success'],
    ]);
    const { prompt } = requestOf(claude);
    expect(requestOf(gemini).prompt).toBe(prompt);
    expect(prompt).toContain('Issue #7: Fix login');
    expect(prompt).toContain('passed: every workflow run');
    expect(prompt).toContain('export const login = 1;');
    expect(github.fileContent).toHaveBeenCalledWith({ owner: 'acme', repo: 'widgets' }, 'src/login.ts', 'sha1');

    expect(savedResults(queries)).toEqual([
      expect.objectContaining({ reviewer: 'claude', model: 'claude-m', verdict: 'approve', error: null, inputTokens: 100 }),
      expect.objectContaining({ reviewer: 'gemini', model: 'gemini-m', verdict: 'approve', error: null }),
    ]);
    expect(savedReview(queries)).toMatchObject({ status: 'completed', ciState: 'passed', failedJobs: [] });
    expect(github.upsertComment).toHaveBeenCalledWith({ owner: 'acme', repo: 'widgets' }, 12, expect.stringContaining('Both reviewers approve'));
  });

  it('gives each reviewer its own tool log over one repository download, made only when a tool is used', async () => {
    const { runner, github, claude, gemini, queries } = setup({
      claude: async ({ tools }) => {
        await tools.run({ id: 'c1', name: 'read_file', input: { path: 'src/login.ts' } });
        await tools.run({ id: 'c2', name: 'search', input: { query: 'login' } });
        return { ...answer('approve', 'claude-m'), sources: tools.sources };
      },
      gemini: async ({ tools }) => {
        await tools.run({ id: 'g1', name: 'read_file', input: { path: 'missing.ts' } });
        return { ...answer('approve', 'gemini-m'), sources: tools.sources };
      },
    });
    await runner.run('rev_1');
    expect(github.tarball).toHaveBeenCalledTimes(1);
    expect(github.tarball).toHaveBeenCalledWith({ owner: 'acme', repo: 'widgets' }, 'sha1');
    expect(requestOf(claude).tools).not.toBe(requestOf(gemini).tools);
    expect(savedResults(queries).map((r: { sources: unknown }) => r.sources)).toEqual([
      [
        { tool: 'read_file', target: 'src/login.ts', ok: true },
        { tool: 'search', target: 'login', ok: true },
      ],
      [{ tool: 'read_file', target: 'missing.ts', ok: false }],
    ]);
    // Tool results are delimited with the same random id as the prompt's sections.
    const nonce = requestOf(claude).prompt.match(/use the id ([0-9a-f]+)\./)?.[1];
    const result = await requestOf(claude).tools.run({ id: 'c3', name: 'list_dir', input: { path: '' } });
    expect(result.content.startsWith(`BEGIN tool_result ${nonce}\n`)).toBe(true);
  });

  it('downloads nothing when no reviewer uses a tool', async () => {
    const { runner, github } = setup();
    await runner.run('rev_1');
    expect(github.tarball).not.toHaveBeenCalled();
  });

  it('reports failure on the commit when a reviewer asks for changes', async () => {
    const { runner, github } = setup({ gemini: async () => answer('changes', 'gemini-m') });
    await runner.run('rev_1');
    expect(github.setStatus).toHaveBeenLastCalledWith(expect.anything(), 'sha1', {
      state: 'failure',
      description: 'Changes requested by Gemini',
    });
  });

  it('never approves over red CI', async () => {
    const { runner, github, queries } = setup();
    github.workflowRuns.mockResolvedValue([{ id: 5, name: 'ci', status: 'completed', conclusion: 'failure' }]);
    github.failedJobNames.mockResolvedValue(['test']);
    await runner.run('rev_1');
    expect(github.setStatus).toHaveBeenLastCalledWith(expect.anything(), 'sha1', expect.objectContaining({ state: 'failure' }));
    expect(savedReview(queries)).toMatchObject({ ciState: 'failed', failedJobs: ['test'] });
  });

  it('keeps one reviewer’s answer when the other fails, and marks the review as an error', async () => {
    const { runner, github, queries } = setup({
      gemini: async () => {
        throw new Error('quota exceeded');
      },
    });
    await runner.run('rev_1');
    expect(savedResults(queries)).toEqual([
      expect.objectContaining({ reviewer: 'claude', verdict: 'approve', error: null }),
      expect.objectContaining({ reviewer: 'gemini', verdict: null, model: null, output: undefined, error: 'quota exceeded' }),
    ]);
    expect(github.setStatus).toHaveBeenLastCalledWith(expect.anything(), 'sha1', expect.objectContaining({ state: 'error' }));
    expect(github.upsertComment).toHaveBeenCalledWith(expect.anything(), 12, expect.stringContaining('No answer: quota exceeded'));
  });

  it('does not ask the models about a commit that a newer push replaced', async () => {
    const { runner, github, claude, gemini, queries } = setup();
    github.getPullRequest.mockResolvedValue({ title: 't', body: '', headSha: 'sha2' });
    await runner.run('rev_1');
    expect(claude.review).not.toHaveBeenCalled();
    expect(gemini.review).not.toHaveBeenCalled();
    expect(github.upsertComment).not.toHaveBeenCalled();
    expect(queries.review.update).toHaveBeenCalledWith({
      where: { id: 'rev_1' },
      data: expect.objectContaining({ status: 'failed', error: 'Superseded by a newer commit' }),
    });
    expect(github.setStatus).toHaveBeenLastCalledWith(expect.anything(), 'sha1', expect.objectContaining({ state: 'error' }));
  });

  it('still sets the commit status but leaves the comment to the newer commit when a push arrives mid-review', async () => {
    const { runner, github } = setup();
    github.getPullRequest
      .mockResolvedValueOnce({ title: 't', body: '', headSha: 'sha1' })
      .mockResolvedValueOnce({ title: 't', body: '', headSha: 'sha2' });
    await runner.run('rev_1');
    expect(github.setStatus).toHaveBeenLastCalledWith(expect.anything(), 'sha1', expect.objectContaining({ state: 'success' }));
    expect(github.upsertComment).not.toHaveBeenCalled();
  });

  it('records a failure of the whole run on the review and the commit instead of rejecting', async () => {
    const { runner, github, queries } = setup();
    github.listFiles.mockRejectedValue(new Error('GitHub returned 502'));
    await expect(runner.run('rev_1')).resolves.toBeUndefined();
    expect(queries.review.update).toHaveBeenCalledWith({
      where: { id: 'rev_1' },
      data: expect.objectContaining({ status: 'failed', error: 'GitHub returned 502' }),
    });
    expect(github.setStatus).toHaveBeenLastCalledWith(expect.anything(), 'sha1', expect.objectContaining({ state: 'error' }));
  });
});
