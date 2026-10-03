import { ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import type { GithubReviewClient } from './github-review.client';
import type { ReviewRunner } from './review.runner';
import { ReviewService } from './review.service';
import type { PullRequestEvent } from './webhook-payload';

const REPO = { id: 'repo_1', githubRepoName: 'Acme/widgets' };
const ISSUE = { id: 'issue_1', githubRepoId: 'repo_1', githubIssueNumber: 7 };

const event = (over: Partial<PullRequestEvent> = {}, pr: Partial<PullRequestEvent['pull_request']> = {}): PullRequestEvent => ({
  action: 'opened',
  repository: { full_name: 'acme/widgets' },
  pull_request: {
    number: 12,
    title: 'fix: trim email',
    html_url: 'https://github.com/acme/widgets/pull/12',
    user: { login: 'ada', avatar_url: 'https://avatars.example/ada' },
    head: { sha: 'sha1' },
    ...pr,
  },
  ...over,
});

function setup() {
  const prisma = {
    githubRepo: { findFirst: jest.fn().mockResolvedValue(REPO) },
    issue: { findFirst: jest.fn().mockResolvedValue(ISSUE), findUnique: jest.fn().mockResolvedValue(ISSUE) },
    pullRequest: {
      upsert: jest.fn().mockResolvedValue({ id: 'pr_1' }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findMany: jest.fn().mockResolvedValue([]),
    },
    review: {
      create: jest.fn().mockResolvedValue({ id: 'rev_1' }),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      findUnique: jest.fn(),
    },
  };
  const github = { closingIssueNumbers: jest.fn().mockResolvedValue([7]) };
  const runner = { run: jest.fn().mockResolvedValue(undefined) };
  const service = new ReviewService(
    prisma as unknown as PrismaService,
    github as unknown as GithubReviewClient,
    runner as unknown as ReviewRunner,
  );
  return { service, prisma, github, runner };
}

describe('ReviewService.handlePullRequest', () => {
  it.each(['opened', 'synchronize', 'reopened', 'ready_for_review'])('starts a review on %s', async (action) => {
    const { service, prisma, runner } = setup();
    await expect(service.handlePullRequest(event({ action }))).resolves.toBe('started');
    expect(prisma.pullRequest.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: expect.objectContaining({ issueId: 'issue_1', headSha: 'sha1', authorLogin: 'ada' }) }),
    );
    expect(prisma.review.create).toHaveBeenCalledWith({ data: { pullRequestId: 'pr_1', headSha: 'sha1' } });
    expect(runner.run).toHaveBeenCalledWith('rev_1');
  });

  it('looks the repository up case-insensitively and asks GitHub which issues the PR closes', async () => {
    const { service, prisma, github } = setup();
    await service.handlePullRequest(event());
    expect(prisma.githubRepo.findFirst).toHaveBeenCalledWith({
      where: { githubRepoName: { equals: 'acme/widgets', mode: 'insensitive' } },
    });
    expect(github.closingIssueNumbers).toHaveBeenCalledWith({ owner: 'Acme', repo: 'widgets' }, 12);
    expect(prisma.issue.findFirst).toHaveBeenCalledWith({ where: { githubRepoId: 'repo_1', githubIssueNumber: { in: [7] } } });
  });

  it('spends nothing on pull requests that are not about a bounty', async () => {
    const { service, prisma, github, runner } = setup();

    prisma.githubRepo.findFirst.mockResolvedValueOnce(null);
    await expect(service.handlePullRequest(event())).resolves.toBe('ignored');

    github.closingIssueNumbers.mockResolvedValueOnce([]);
    await expect(service.handlePullRequest(event())).resolves.toBe('ignored');

    prisma.issue.findFirst.mockResolvedValueOnce(null);
    await expect(service.handlePullRequest(event())).resolves.toBe('ignored');

    expect(runner.run).not.toHaveBeenCalled();
    expect(prisma.review.create).not.toHaveBeenCalled();
  });

  it('ignores drafts and actions that do not change the code', async () => {
    const { service, github } = setup();
    await expect(service.handlePullRequest(event({}, { draft: true }))).resolves.toBe('ignored');
    await expect(service.handlePullRequest(event({ action: 'labeled' }))).resolves.toBe('ignored');
    expect(github.closingIssueNumbers).not.toHaveBeenCalled();
  });

  it('treats a redelivered event as a duplicate and does not run a second review', async () => {
    const { service, prisma, runner } = setup();
    prisma.review.create.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', { code: 'P2002', clientVersion: 'test' }),
    );
    await expect(service.handlePullRequest(event())).resolves.toBe('duplicate');
    expect(runner.run).not.toHaveBeenCalled();
  });

  it('lets other database errors propagate', async () => {
    const { service, prisma } = setup();
    prisma.review.create.mockRejectedValueOnce(new Error('connection lost'));
    await expect(service.handlePullRequest(event())).rejects.toThrow('connection lost');
  });

  it('only records how a closed pull request ended, without starting anything', async () => {
    const { service, prisma, runner } = setup();
    await expect(service.handlePullRequest(event({ action: 'closed' }, { merged: true }))).resolves.toBe('updated');
    expect(prisma.pullRequest.updateMany).toHaveBeenCalledWith({
      where: { githubRepoId: 'repo_1', number: 12 },
      data: { state: 'merged' },
    });
    await service.handlePullRequest(event({ action: 'closed' }));
    expect(prisma.pullRequest.updateMany).toHaveBeenLastCalledWith(expect.objectContaining({ data: { state: 'closed' } }));
    expect(runner.run).not.toHaveBeenCalled();
  });
});

describe('ReviewService.onModuleInit', () => {
  it('fails reviews a restart interrupted so the app offers a re-run', async () => {
    const { service, prisma } = setup();
    await service.onModuleInit();
    expect(prisma.review.updateMany).toHaveBeenCalledWith({
      where: { status: 'pending' },
      data: expect.objectContaining({ status: 'failed', error: 'Interrupted by a server restart' }),
    });
  });
});

const result = (reviewer: string, verdict: 'approve' | 'changes' | null) => ({
  reviewer,
  model: `${reviewer}-m`,
  verdict,
  error: verdict ? null : 'quota exceeded',
  output: verdict && {
    verdict,
    confidence: 'high',
    criteria: [{ criterion: 'c', status: 'met', evidence: 'e' }],
    risks: [],
    developerFeedback: 'f',
    maintainerSummary: `${reviewer} says ${verdict}`,
  },
});
const pull = (reviews: unknown[]) => ({
  id: 'pr_1',
  number: 12,
  title: 't',
  url: 'u',
  authorLogin: 'ada',
  authorAvatarUrl: null,
  state: 'open',
  headSha: 'sha2',
  openedAt: new Date('2026-10-03T10:00:00Z'),
  updatedAt: new Date('2026-10-03T11:00:00Z'),
  reviews,
});
const review = (over: Record<string, unknown>) => ({
  id: 'rev_1',
  headSha: 'sha2',
  status: 'completed',
  ciState: 'passed',
  failedJobs: [],
  completedAt: new Date('2026-10-03T10:30:00Z'),
  results: [result('claude', 'approve'), result('gemini', 'approve')],
  ...over,
});

describe('ReviewService.listSubmissions', () => {
  it('rejects an unknown issue', async () => {
    const { service, prisma } = setup();
    prisma.issue.findUnique.mockResolvedValueOnce(null);
    await expect(service.listSubmissions('nope')).rejects.toThrow(NotFoundException);
  });

  it('shows the review of the current head commit, not of an older push', async () => {
    const { service, prisma } = setup();
    prisma.pullRequest.findMany.mockResolvedValue([
      pull([review({ id: 'rev_2' }), review({ id: 'rev_1', headSha: 'sha1', results: [result('claude', 'changes'), result('gemini', 'changes')] })]),
    ]);
    const [submission] = await service.listSubmissions('issue_1');
    expect(submission.check.state).toBe('passed');
    expect(submission.check.reviewers.map((r) => [r.reviewer, r.verdict, r.summary])).toEqual([
      ['Claude', 'approve', 'claude says approve'],
      ['Gemini', 'approve', 'gemini says approve'],
    ]);
    expect(submission).toMatchObject({ prNumber: 12, headSha: 'sha2', ci: { state: 'passed', failedJobs: [] }, retryableReviewId: null });
  });

  it('is not run yet before any review exists, and pending while one runs', async () => {
    const { service, prisma } = setup();
    prisma.pullRequest.findMany.mockResolvedValueOnce([pull([])]);
    expect((await service.listSubmissions('issue_1'))[0]).toMatchObject({ check: { state: 'not_run', reviewers: [] }, ci: null });

    prisma.pullRequest.findMany.mockResolvedValueOnce([pull([review({ status: 'pending', ciState: null, results: [] })])]);
    const pending = (await service.listSubmissions('issue_1'))[0];
    expect(pending.check.state).toBe('pending');
    expect(pending.check.reviewers.map((r) => r.verdict)).toEqual(['pending', 'pending']);
  });

  it('flags a review where one reviewer failed as an error that can be retried, keeping the other answer', async () => {
    const { service, prisma } = setup();
    prisma.pullRequest.findMany.mockResolvedValue([pull([review({ results: [result('claude', 'approve'), result('gemini', null)] })])]);
    const [submission] = await service.listSubmissions('issue_1');
    expect(submission.check.state).toBe('error');
    expect(submission.check.reviewers.map((r) => [r.verdict, r.summary])).toEqual([
      ['approve', 'claude says approve'],
      ['error', 'quota exceeded'],
    ]);
    expect(submission.retryableReviewId).toBe('rev_1');
  });

  it('shows failed CI as a failed check even when both reviewers approve', async () => {
    const { service, prisma } = setup();
    prisma.pullRequest.findMany.mockResolvedValue([pull([review({ ciState: 'failed', failedJobs: ['test'] })])]);
    const [submission] = await service.listSubmissions('issue_1');
    expect(submission.check.state).toBe('failed');
    expect(submission.ci).toEqual({ state: 'failed', failedJobs: ['test'] });
  });
});

describe('ReviewService.rerun', () => {
  const failedReview = review({ status: 'failed', ciState: null, results: [] });

  it('claims a failed review and runs it again', async () => {
    const { service, prisma, runner } = setup();
    prisma.review.findUnique.mockResolvedValue(failedReview);
    prisma.review.updateMany.mockResolvedValueOnce({ count: 1 });
    await service.rerun('rev_1');
    expect(prisma.review.updateMany).toHaveBeenCalledWith({
      where: { id: 'rev_1', status: { not: 'pending' } },
      data: { status: 'pending', error: null, completedAt: null },
    });
    expect(runner.run).toHaveBeenCalledWith('rev_1');
  });

  it('refuses to spend money again on a review that succeeded', async () => {
    const { service, prisma, runner } = setup();
    prisma.review.findUnique.mockResolvedValue(review({}));
    await expect(service.rerun('rev_1')).rejects.toThrow(ConflictException);
    expect(runner.run).not.toHaveBeenCalled();
  });

  it('lets only one of two simultaneous requests start a run', async () => {
    const { service, prisma, runner } = setup();
    prisma.review.findUnique.mockResolvedValue(failedReview);
    prisma.review.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(service.rerun('rev_1')).rejects.toThrow('already running');
    expect(runner.run).not.toHaveBeenCalled();
  });

  it('reports an unknown review', async () => {
    const { service, prisma } = setup();
    prisma.review.findUnique.mockResolvedValue(null);
    await expect(service.rerun('nope')).rejects.toThrow(NotFoundException);
  });
});
