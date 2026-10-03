import type { PayoutService } from '../payout/payout.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { GithubReviewClient } from '../review/github-review.client';
import type { PullRequestEvent } from '../review/webhook-payload';
import { MergeService } from './merge.service';

const REPO = { id: 'repo_1', githubRepoName: 'Acme/widgets' };
const ISSUE = { id: 'issue_1', githubRepoId: 'repo_1', githubIssueNumber: 7 };

const event = (over: Partial<PullRequestEvent> = {}, pr: Partial<PullRequestEvent['pull_request']> = {}): PullRequestEvent => ({
  action: 'closed',
  repository: { full_name: 'acme/widgets' },
  pull_request: {
    number: 12,
    title: 'fix: trim email',
    html_url: 'https://github.com/acme/widgets/pull/12',
    user: { id: 501, login: 'ada' },
    head: { sha: 'sha1' },
    ...pr,
  },
  ...over,
});

function setup() {
  const prisma = {
    githubRepo: { findFirst: jest.fn().mockResolvedValue(REPO) },
    issue: { findFirst: jest.fn().mockResolvedValue(ISSUE) },
    pullRequest: {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findUnique: jest.fn().mockResolvedValue({ id: 'pr_1', issueId: 'issue_1' }),
    },
  };
  const github = { closingIssueNumbers: jest.fn().mockResolvedValue([7]) };
  const payouts = { releaseForMerge: jest.fn().mockResolvedValue('released') };
  const service = new MergeService(
    prisma as unknown as PrismaService,
    github as unknown as GithubReviewClient,
    payouts as unknown as PayoutService,
  );
  return { service, prisma, github, payouts };
}

describe('MergeService.handleClosed', () => {
  it('marks a merged pull request and pays its author, not whoever merged it', async () => {
    const { service, prisma, payouts } = setup();
    await expect(service.handleClosed(event({}, { merged: true }))).resolves.toBe('releasing');
    expect(prisma.pullRequest.updateMany).toHaveBeenCalledWith({
      where: { githubRepoId: 'repo_1', number: 12 },
      data: { state: 'merged' },
    });
    expect(payouts.releaseForMerge).toHaveBeenCalledWith('issue_1', { githubId: 501, login: 'ada' });
  });

  it('pays a merged pull request that was never reviewed, finding its issue on GitHub', async () => {
    const { service, prisma, github, payouts } = setup();
    prisma.pullRequest.updateMany.mockResolvedValueOnce({ count: 0 });
    prisma.pullRequest.findUnique.mockResolvedValueOnce(null);
    await expect(service.handleClosed(event({}, { merged: true }))).resolves.toBe('releasing');
    expect(github.closingIssueNumbers).toHaveBeenCalledWith({ owner: 'Acme', repo: 'widgets' }, 12);
    expect(payouts.releaseForMerge).toHaveBeenCalledWith('issue_1', { githubId: 501, login: 'ada' });
  });

  it('pays nothing for a merged pull request that closes no bounty', async () => {
    const { service, prisma, github, payouts } = setup();
    prisma.pullRequest.updateMany.mockResolvedValueOnce({ count: 0 });
    prisma.pullRequest.findUnique.mockResolvedValueOnce(null);
    github.closingIssueNumbers.mockResolvedValueOnce([]);
    await expect(service.handleClosed(event({}, { merged: true }))).resolves.toBe('ignored');
    expect(payouts.releaseForMerge).not.toHaveBeenCalled();
  });

  it('only records a pull request closed without merging, paying nothing', async () => {
    const { service, prisma, payouts } = setup();
    await expect(service.handleClosed(event({}, { merged: false }))).resolves.toBe('updated');
    expect(prisma.pullRequest.updateMany).toHaveBeenCalledWith({
      where: { githubRepoId: 'repo_1', number: 12 },
      data: { state: 'closed' },
    });
    expect(payouts.releaseForMerge).not.toHaveBeenCalled();
  });

  it('ignores actions other than closed and repositories it does not track', async () => {
    const { service, prisma, payouts } = setup();
    await expect(service.handleClosed(event({ action: 'opened' }))).resolves.toBe('ignored');
    prisma.githubRepo.findFirst.mockResolvedValueOnce(null);
    await expect(service.handleClosed(event({}, { merged: true }))).resolves.toBe('ignored');
    expect(prisma.pullRequest.updateMany).not.toHaveBeenCalled();
    expect(payouts.releaseForMerge).not.toHaveBeenCalled();
  });

  it('keeps a failed release in the log instead of failing the delivery', async () => {
    const { service, payouts } = setup();
    payouts.releaseForMerge.mockRejectedValueOnce(new Error('rpc down'));
    await expect(service.handleClosed(event({}, { merged: true }))).resolves.toBe('releasing');
  });
});
