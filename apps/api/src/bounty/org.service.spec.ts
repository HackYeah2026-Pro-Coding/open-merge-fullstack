import { NotFoundException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env';
import type { PrismaService } from '../prisma/prisma.service';
import { REPO, at, bounty, pull } from './bounty-fixtures';
import { OrgService } from './org.service';

function setup() {
  const prisma = {
    issue: { findMany: jest.fn().mockResolvedValue([]) },
    githubRepo: { count: jest.fn().mockResolvedValue(2), findMany: jest.fn(), findFirst: jest.fn() },
  };
  const values: Record<string, string> = { GITHUB_ORG: 'Acme', GITHUB_OWNER_LOGIN: 'acme-owner' };
  const config = { get: (key: string) => values[key] } as unknown as ConfigService<Env, true>;
  return { service: new OrgService(prisma as unknown as PrismaService, config), prisma };
}

describe('OrgService', () => {
  it('describes the configured organization and owner', () => {
    expect(setup().service.organization()).toEqual({
      login: 'Acme',
      name: null,
      url: 'https://github.com/Acme',
      avatarUrl: 'https://github.com/Acme.png',
      owner: { login: 'acme-owner', avatarUrl: 'https://github.com/acme-owner.png' },
    });
  });

  it('counts repositories and distinct pull request authors', async () => {
    const { service, prisma } = setup();
    prisma.issue.findMany.mockResolvedValue([
      bounty({ pullRequests: [pull({ authorLogin: 'ada' }), pull({ id: 'pr_2', authorLogin: 'Bob' })] }),
      bounty({ id: 'issue_2', pullRequests: [pull({ id: 'pr_3', authorLogin: 'ADA' })] }),
    ]);
    await expect(service.stats()).resolves.toMatchObject({ repositoryCount: 2, contributorCount: 2, openCount: 2 });
  });

  it('shows the twelve latest events, newest first', async () => {
    const { service, prisma } = setup();
    const many = Array.from({ length: 10 }, (_, i) =>
      bounty({ id: `issue_${i}`, createdAt: at(i), pullRequests: [pull({ id: `pr_${i}`, openedAt: at(20 + i) })] }),
    );
    prisma.issue.findMany.mockResolvedValue(many);
    const activity = await service.activity();
    expect(activity).toHaveLength(12);
    expect(activity[0].event).toMatchObject({ type: 'pr_opened', at: at(29).toISOString() });
    expect(activity[0].bounty).toMatchObject({ id: 'issue_9', repository: { name: 'widgets' } });
  });

  it('orders repositories by latest activity, then name', async () => {
    const { service, prisma } = setup();
    const quiet = { ...REPO, id: 'repo_2', githubRepoName: 'Acme/alpha', issues: [] };
    const zeta = { ...REPO, id: 'repo_3', githubRepoName: 'Acme/zeta', issues: [] };
    prisma.githubRepo.findMany.mockResolvedValue([zeta, quiet, { ...REPO, issues: [bounty()] }]);
    expect((await service.repositories()).map((r) => r.name)).toEqual(['widgets', 'alpha', 'zeta']);
  });

  it('answers 404 for a repository outside the organization', async () => {
    const { service, prisma } = setup();
    prisma.githubRepo.findFirst.mockResolvedValue(null);
    await expect(service.repository('nest')).rejects.toBeInstanceOf(NotFoundException);
  });
});
