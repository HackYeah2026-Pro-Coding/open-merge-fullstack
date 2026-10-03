import { BadGatewayException, BadRequestException, NotFoundException } from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service';
import { GithubClearService } from './github-clear.service';
import type { GithubService } from './github.service';

describe('GithubClearService', () => {
  const ref = { owner: 'acme', repo: 'widgets' };
  const base = '/repos/acme/widgets';

  function setup() {
    const prisma = {
      githubRepo: {
        findFirst: jest.fn().mockResolvedValue({ id: 'repo_1', githubRepoName: 'Acme/widgets' }),
      },
      issue: { findMany: jest.fn().mockResolvedValue([{ githubIssueNumber: 3 }]) },
    };
    const lists: Record<string, unknown[]> = {
      [`${base}/pulls?state=open`]: [{ number: 10 }, { number: 11 }],
      [`${base}/branches`]: [{ name: 'main' }, { name: 'develop' }, { name: 'feature/x' }],
      [`${base}/issues?state=all`]: [
        { number: 1, node_id: 'I_1' },
        { number: 3, node_id: 'I_3' },
        { number: 10, node_id: 'PR_10', pull_request: {} },
      ],
    };
    const github = {
      requestAll: jest.fn((path: string) => Promise.resolve(lists[path])),
      request: jest.fn((method: string, path: string) =>
        Promise.resolve(method === 'GET' && path === base ? { default_branch: 'develop' } : undefined),
      ),
      graphql: jest.fn().mockResolvedValue({}),
    };
    const service = new GithubClearService(
      prisma as unknown as PrismaService,
      github as unknown as GithubService,
    );
    return { service, prisma, github };
  }

  it('closes PRs, deletes other branches and non-bounty issues', async () => {
    const { service, github } = setup();

    await expect(service.clear(ref, 'acme/WIDGETS')).resolves.toEqual({
      repo: 'Acme/widgets',
      closedPullRequests: [10, 11],
      deletedBranches: ['feature/x'],
      keptBranches: ['main', 'develop'],
      deletedIssues: [1],
      skippedBountyIssues: [3],
      failures: [],
    });
    expect(github.request).toHaveBeenCalledWith('PATCH', `${base}/pulls/10`, { state: 'closed' });
    expect(github.request).toHaveBeenCalledWith('DELETE', `${base}/git/refs/heads/feature/x`);
    expect(github.graphql).toHaveBeenCalledTimes(1);
    expect(github.graphql).toHaveBeenCalledWith(expect.stringContaining('deleteIssue'), { id: 'I_1' });
  });

  it('closes pull requests before deleting any branch', async () => {
    const { service, github } = setup();

    await service.clear(ref, 'acme/widgets');
    const calls = github.request.mock.calls.map(([method]) => method);
    expect(calls.lastIndexOf('PATCH')).toBeLessThan(calls.indexOf('DELETE'));
  });

  it('refuses a repo that is not stored, without calling GitHub', async () => {
    const { service, prisma, github } = setup();
    prisma.githubRepo.findFirst.mockResolvedValue(null);

    await expect(service.clear(ref, 'acme/widgets')).rejects.toBeInstanceOf(NotFoundException);
    expect(github.requestAll).not.toHaveBeenCalled();
  });

  it('refuses when the confirmation does not match, without calling GitHub', async () => {
    const { service, github } = setup();

    await expect(service.clear(ref, 'acme/other')).rejects.toBeInstanceOf(BadRequestException);
    expect(github.requestAll).not.toHaveBeenCalled();
  });

  it('records a refused item and keeps clearing the rest', async () => {
    const { service, github } = setup();
    github.request.mockImplementation((method: string, path: string) => {
      if (method === 'DELETE') return Promise.reject(new BadGatewayException('protected branch'));
      return Promise.resolve(method === 'GET' && path === base ? { default_branch: 'develop' } : undefined);
    });

    const result = await service.clear(ref, 'acme/widgets');
    expect(result.failures).toEqual([{ target: 'branch feature/x', message: 'protected branch' }]);
    expect(result.deletedBranches).toEqual([]);
    expect(result.deletedIssues).toEqual([1]);
  });

  it('lets unexpected errors propagate', async () => {
    const { service, github } = setup();
    const failure = new TypeError('fetch failed');
    github.graphql.mockRejectedValue(failure);

    await expect(service.clear(ref, 'acme/widgets')).rejects.toBe(failure);
  });
});
