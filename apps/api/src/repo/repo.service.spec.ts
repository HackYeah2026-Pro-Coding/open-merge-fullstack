import { ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import type { GithubService } from '../github/github.service';
import type { PrismaService } from '../prisma/prisma.service';
import { RepoService } from './repo.service';

describe('RepoService', () => {
  const ref = { owner: 'NestJS', repo: 'Nest' };
  const createdAt = new Date('2026-10-03T12:00:00.000Z');

  function setup() {
    const github = {
      getRepo: jest.fn().mockResolvedValue({
        fullName: 'nestjs/nest',
        htmlUrl: 'https://github.com/nestjs/nest',
        description: 'A progressive Node.js framework',
        isPrivate: false,
      }),
    };
    const prisma = {
      githubRepo: { create: jest.fn(), findMany: jest.fn(), findUnique: jest.fn(), update: jest.fn(), delete: jest.fn() },
    };
    const service = new RepoService(
      prisma as unknown as PrismaService,
      github as unknown as GithubService,
    );
    return { service, github, prisma };
  }

  it('stores the repo under the canonical name GitHub reports', async () => {
    const { service, prisma } = setup();
    prisma.githubRepo.create.mockResolvedValue({
      id: 'repo_1',
      githubRepoName: 'nestjs/nest',
      githubRepoUrl: 'https://github.com/nestjs/nest',
      createdAt,
    });

    await expect(service.create(ref)).resolves.toEqual({
      id: 'repo_1',
      name: 'nestjs/nest',
      url: 'https://github.com/nestjs/nest',
      createdAt: createdAt.toISOString(),
    });
    expect(prisma.githubRepo.create).toHaveBeenCalledWith({
      data: {
        githubRepoName: 'nestjs/nest',
        githubRepoUrl: 'https://github.com/nestjs/nest',
        description: 'A progressive Node.js framework',
        isPrivate: false,
      },
    });
  });

  it('returns a conflict when the repo is already stored', async () => {
    const { service, prisma } = setup();
    prisma.githubRepo.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );

    await expect(service.create(ref)).rejects.toBeInstanceOf(ConflictException);
  });

  it('does not touch the database when GitHub has no such repo', async () => {
    const { service, github, prisma } = setup();
    github.getRepo.mockRejectedValue(new NotFoundException());

    await expect(service.create(ref)).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.githubRepo.create).not.toHaveBeenCalled();
  });

  it('lets unexpected database errors propagate', async () => {
    const { service, prisma } = setup();
    const failure = new Error('connection lost');
    prisma.githubRepo.create.mockRejectedValue(failure);

    await expect(service.create(ref)).rejects.toBe(failure);
  });

  const stored = {
    id: 'repo_1',
    githubRepoName: 'nestjs/nest',
    githubRepoUrl: 'https://github.com/nestjs/nest',
    createdAt,
  };
  const response = {
    id: 'repo_1',
    name: 'nestjs/nest',
    url: 'https://github.com/nestjs/nest',
    createdAt: createdAt.toISOString(),
  };

  function prismaError(code: string) {
    return new Prisma.PrismaClientKnownRequestError('failed', { code, clientVersion: 'test' });
  }

  it('lists repos newest first', async () => {
    const { service, prisma } = setup();
    prisma.githubRepo.findMany.mockResolvedValue([stored]);

    await expect(service.list()).resolves.toEqual([response]);
    expect(prisma.githubRepo.findMany).toHaveBeenCalledWith({ orderBy: { createdAt: 'desc' } });
  });

  it('returns one repo by id', async () => {
    const { service, prisma } = setup();
    prisma.githubRepo.findUnique.mockResolvedValue(stored);

    await expect(service.get('repo_1')).resolves.toEqual(response);
  });

  it('returns not found for an unknown id', async () => {
    const { service, prisma } = setup();
    prisma.githubRepo.findUnique.mockResolvedValue(null);

    await expect(service.get('missing')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('deletes a repo', async () => {
    const { service, prisma } = setup();
    prisma.githubRepo.delete.mockResolvedValue(stored);

    await expect(service.remove('repo_1')).resolves.toBeUndefined();
    expect(prisma.githubRepo.delete).toHaveBeenCalledWith({ where: { id: 'repo_1' } });
  });

  it('returns not found when deleting an unknown id', async () => {
    const { service, prisma } = setup();
    prisma.githubRepo.delete.mockRejectedValue(prismaError('P2025'));

    await expect(service.remove('missing')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('refuses to delete a repo that still has bounties', async () => {
    const { service, prisma } = setup();
    prisma.githubRepo.delete.mockRejectedValue(prismaError('P2003'));

    await expect(service.remove('repo_1')).rejects.toBeInstanceOf(ConflictException);
  });

  it('updates a repo with the name GitHub reports for the new URL', async () => {
    const { service, github, prisma } = setup();
    prisma.githubRepo.findUnique.mockResolvedValue(stored);
    prisma.githubRepo.update.mockResolvedValue(stored);

    await expect(service.update('repo_1', ref)).resolves.toEqual(response);
    expect(github.getRepo).toHaveBeenCalledWith(ref);
    expect(prisma.githubRepo.update).toHaveBeenCalledWith({
      where: { id: 'repo_1' },
      data: {
        githubRepoName: 'nestjs/nest',
        githubRepoUrl: 'https://github.com/nestjs/nest',
        description: 'A progressive Node.js framework',
        isPrivate: false,
      },
    });
  });

  it('returns not found when updating an unknown id, without calling GitHub', async () => {
    const { service, github, prisma } = setup();
    prisma.githubRepo.findUnique.mockResolvedValue(null);

    await expect(service.update('missing', ref)).rejects.toBeInstanceOf(NotFoundException);
    expect(github.getRepo).not.toHaveBeenCalled();
  });

  it('returns a conflict when updating to a repo stored under another id', async () => {
    const { service, prisma } = setup();
    prisma.githubRepo.findUnique.mockResolvedValue(stored);
    prisma.githubRepo.update.mockRejectedValue(prismaError('P2002'));

    await expect(service.update('repo_1', ref)).rejects.toBeInstanceOf(ConflictException);
  });
});
