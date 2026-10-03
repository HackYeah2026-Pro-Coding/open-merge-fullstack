import { NotFoundException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env';
import type { IssueService } from '../issue/issue.service';
import type { PrismaService } from '../prisma/prisma.service';
import { REPO, at, bounty, payout, pull } from './bounty-fixtures';
import { BountyService } from './bounty.service';

function setup() {
  const prisma = {
    issue: { findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn(), findUniqueOrThrow: jest.fn() },
    githubRepo: { findFirst: jest.fn().mockResolvedValue(REPO) },
    pullRequest: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const issues = { create: jest.fn().mockResolvedValue({ id: 'issue_9' }) };
  const values: Record<string, string> = { GITHUB_ORG: 'Acme', GITHUB_OWNER_LOGIN: 'acme-owner' };
  const config = { get: (key: string) => values[key] } as unknown as ConfigService<Env, true>;
  const service = new BountyService(prisma as unknown as PrismaService, issues as unknown as IssueService, config);
  return { service, prisma, issues };
}

describe('BountyService.list', () => {
  const records = [
    bounty({ id: 'a', title: 'Small open one', githubIssueNumber: 1, rewardAmount: 5n, createdAt: at(1) }),
    bounty({ id: 'b', title: 'Big reviewed one', githubIssueNumber: 2, rewardAmount: 9_007_199_254_740_993n, createdAt: at(2), pullRequests: [pull()] }),
    bounty({ id: 'c', title: 'Middle one', githubIssueNumber: 3, rewardAmount: 50n, createdAt: at(3) }),
  ];

  it('lists only bounties with a GitHub issue in the organization', async () => {
    const { service, prisma } = setup();
    await service.list({});
    expect(prisma.issue.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          githubIssueNumber: { not: null },
          githubRepo: { githubRepoName: { startsWith: 'Acme/', mode: 'insensitive' } },
        },
      }),
    );
  });

  it('narrows to one repository by its name within the organization', async () => {
    const { service, prisma } = setup();
    await service.list({ repo: 'widgets' });
    expect(prisma.issue.findMany.mock.calls[0][0].where.githubRepo).toEqual({
      githubRepoName: { equals: 'Acme/widgets', mode: 'insensitive' },
    });
  });

  it('sorts newest first by default and by exact reward on request', async () => {
    const { service, prisma } = setup();
    prisma.issue.findMany.mockResolvedValue(records);
    expect((await service.list({})).map((b) => b.id)).toEqual(['c', 'b', 'a']);
    expect((await service.list({ sort: 'reward' })).map((b) => b.id)).toEqual(['b', 'c', 'a']);
  });

  it('filters by status and by title or #number', async () => {
    const { service, prisma } = setup();
    prisma.issue.findMany.mockResolvedValue(records);
    expect((await service.list({ status: 'in_review' })).map((b) => b.id)).toEqual(['b']);
    expect((await service.list({ q: 'MIDDLE' })).map((b) => b.id)).toEqual(['c']);
    expect((await service.list({ q: '#1' })).map((b) => b.id)).toEqual(['a']);
  });
});

describe('BountyService.get', () => {
  it('answers 404 for an unknown bounty', async () => {
    const { service, prisma } = setup();
    prisma.issue.findFirst.mockResolvedValue(null);
    await expect(service.get('widgets', 99)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('names the configured owner as creator', async () => {
    const { service, prisma } = setup();
    prisma.issue.findFirst.mockResolvedValue(bounty());
    await expect(service.get('widgets', 7)).resolves.toMatchObject({ createdBy: { login: 'acme-owner' } });
  });
});

describe('BountyService.create', () => {
  const input = { repo: 'widgets', title: 'Trim emails before saving', body: 'Body', rewardAmount: '9007199254740993', labels: ['bug'] };

  it('creates through IssueService with the repository id, exact amount and labels', async () => {
    const { service, prisma, issues } = setup();
    prisma.issue.findUniqueOrThrow.mockResolvedValue(bounty({ id: 'issue_9' }));
    await expect(service.create(input)).resolves.toMatchObject({ id: 'issue_9', status: 'open' });
    expect(issues.create).toHaveBeenCalledWith({
      title: input.title,
      body: 'Body',
      rewardAmount: 9_007_199_254_740_993n,
      repoId: 'repo_1',
      labels: ['bug'],
    });
  });

  it('locks nothing for a repository outside the organization', async () => {
    const { service, prisma, issues } = setup();
    prisma.githubRepo.findFirst.mockResolvedValue(null);
    await expect(service.create(input)).rejects.toBeInstanceOf(NotFoundException);
    expect(issues.create).not.toHaveBeenCalled();
  });
});

describe('BountyService.mySubmissions', () => {
  it("shows a payout only on the developer's own merged pull request", async () => {
    const { service, prisma } = setup();
    const paid = bounty({
      pullRequests: [pull({ state: 'merged' })],
      payout: payout({ releasedAt: at(6), releaseSignature: 'sig' }),
    });
    const lost = bounty({ id: 'issue_2', pullRequests: [pull({ id: 'pr_2', state: 'merged', authorLogin: 'bob' })] });
    prisma.pullRequest.findMany.mockResolvedValue([
      { ...pull({ state: 'merged', updatedAt: at(8) }), issue: paid },
      { ...pull({ id: 'pr_3', number: 13, state: 'closed', updatedAt: at(7) }), issue: lost },
    ]);

    const result = await service.mySubmissions('ADA');

    expect(prisma.pullRequest.findMany.mock.calls[0][0].where.authorLogin).toEqual({ equals: 'ADA', mode: 'insensitive' });
    expect(result.map((r) => r.submission.prNumber)).toEqual([12, 13]);
    expect(result[0].payout).toMatchObject({ state: 'released', txSignature: 'sig' });
    expect(result[1].payout).toBeNull();
  });
});
