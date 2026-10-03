import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env';
import { Prisma } from '../generated/prisma/client';
import type { GithubService } from '../github/github.service';
import type { PrismaService } from '../prisma/prisma.service';
import { REPO } from './bounty-fixtures';
import { OrgReposService } from './org-repos.service';

function githubRepo(name: string, over: Record<string, unknown> = {}) {
  return {
    name,
    full_name: `Acme/${name}`,
    html_url: `https://github.com/Acme/${name}`,
    description: `About ${name}`,
    private: false,
    archived: false,
    pushed_at: '2026-10-03T11:00:00Z',
    ...over,
  };
}

function setup() {
  const github = {
    requestAll: jest.fn().mockResolvedValue([]),
    getRepo: jest.fn().mockResolvedValue({
      fullName: 'Acme/widgets',
      htmlUrl: 'https://github.com/Acme/widgets',
      description: 'Widgets for everyone',
      isPrivate: false,
      archived: false,
    }),
  };
  const prisma = { githubRepo: { findMany: jest.fn().mockResolvedValue([]), create: jest.fn() } };
  const values: Record<string, string> = { GITHUB_ORG: 'Acme', GITHUB_OWNER_LOGIN: 'acme-owner' };
  const config = { get: (key: string) => values[key] } as unknown as ConfigService<Env, true>;
  const service = new OrgReposService(
    prisma as unknown as PrismaService,
    github as unknown as GithubService,
    config,
  );
  return { service, github, prisma };
}

describe('OrgReposService', () => {
  it('lists the organization on GitHub and marks what is already added, ignoring case', async () => {
    const { service, github, prisma } = setup();
    github.requestAll.mockResolvedValue([githubRepo('widgets'), githubRepo('gadgets', { archived: true, pushed_at: null })]);
    prisma.githubRepo.findMany.mockResolvedValue([{ githubRepoName: 'acme/WIDGETS' }]);

    await expect(service.onGithub()).resolves.toEqual([
      {
        name: 'widgets',
        fullName: 'Acme/widgets',
        url: 'https://github.com/Acme/widgets',
        description: 'About widgets',
        isPrivate: false,
        archived: false,
        pushedAt: '2026-10-03T11:00:00Z',
        added: true,
      },
      expect.objectContaining({ name: 'gadgets', archived: true, pushedAt: null, added: false }),
    ]);
    expect(github.requestAll).toHaveBeenCalledWith('/orgs/Acme/repos?type=all&sort=pushed');
  });

  it('stores a repository of the organization under the name GitHub reports', async () => {
    const { service, github, prisma } = setup();
    prisma.githubRepo.create.mockResolvedValue(REPO);

    await expect(service.add('WIDGETS')).resolves.toMatchObject({
      name: 'widgets',
      fullName: 'Acme/widgets',
      stats: { openCount: 0 },
      lastActivityAt: null,
    });
    expect(github.getRepo).toHaveBeenCalledWith({ owner: 'Acme', repo: 'WIDGETS' });
    expect(prisma.githubRepo.create).toHaveBeenCalledWith({
      data: {
        githubRepoName: 'Acme/widgets',
        githubRepoUrl: 'https://github.com/Acme/widgets',
        description: 'Widgets for everyone',
        isPrivate: false,
      },
    });
  });

  it('refuses a repository that GitHub reports under another owner', async () => {
    const { service, github, prisma } = setup();
    github.getRepo.mockResolvedValue({
      fullName: 'Elsewhere/widgets',
      htmlUrl: 'https://github.com/Elsewhere/widgets',
      description: null,
      isPrivate: false,
      archived: false,
    });

    await expect(service.add('widgets')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.githubRepo.create).not.toHaveBeenCalled();
  });

  it('refuses an archived repository', async () => {
    const { service, github, prisma } = setup();
    github.getRepo.mockResolvedValue({
      fullName: 'Acme/widgets',
      htmlUrl: 'https://github.com/Acme/widgets',
      description: null,
      isPrivate: false,
      archived: true,
    });

    await expect(service.add('widgets')).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.githubRepo.create).not.toHaveBeenCalled();
  });

  it('returns a conflict when the repository is already added', async () => {
    const { service, prisma } = setup();
    prisma.githubRepo.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', { code: 'P2002', clientVersion: 'test' }),
    );

    await expect(service.add('widgets')).rejects.toBeInstanceOf(ConflictException);
  });

  it('lets unexpected database errors propagate', async () => {
    const { service, prisma } = setup();
    const failure = new Error('connection lost');
    prisma.githubRepo.create.mockRejectedValue(failure);

    await expect(service.add('widgets')).rejects.toBe(failure);
  });
});
