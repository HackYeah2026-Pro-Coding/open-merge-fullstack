import {
  BadGatewayException,
  ConflictException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import type { GithubService } from '../github/github.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { EscrowService } from '../solana/escrow.service';
import { IssueService } from './issue.service';

describe('IssueService', () => {
  const createdAt = new Date('2026-10-03T12:00:00.000Z');
  const locked = { escrowAddress: 'Esc1111111111111111111111111111111111111111', signature: 'sig_1' };
  const input = {
    title: 'Fix flaky login test',
    body: 'Fails one run in ten.',
    rewardAmount: 9_007_199_254_740_993n,
    repoId: 'repo_1',
  };

  function setup() {
    const prisma = {
      githubRepo: {
        findUnique: jest.fn().mockResolvedValue({ id: 'repo_1', githubRepoName: 'acme/widgets' }),
      },
      issue: {
        create: jest.fn().mockResolvedValue({ id: 'issue_1', title: input.title, body: input.body, labels: [] }),
        update: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
      },
    };
    const github = {
      assertCanCreateIssues: jest.fn(),
      createIssue: jest.fn().mockResolvedValue({
        number: 42,
        htmlUrl: 'https://github.com/acme/widgets/issues/42',
      }),
    };
    const escrow = {
      assertConfigured: jest.fn(),
      lockReward: jest.fn().mockResolvedValue(locked),
    };
    const service = new IssueService(
      prisma as unknown as PrismaService,
      github as unknown as GithubService,
      escrow as unknown as EscrowService,
    );
    return { service, prisma, github, escrow };
  }

  it('locks the reward in escrow, stores the issue in OMT, opens it on GitHub and links the two', async () => {
    const { service, prisma, github, escrow } = setup();
    prisma.issue.update.mockResolvedValue({
      id: 'issue_1',
      title: input.title,
      body: input.body,
      labels: [],
      rewardAmount: input.rewardAmount,
      rewardSymbol: 'OMT',
      githubRepoId: 'repo_1',
      githubIssueNumber: 42,
      githubIssueUrl: 'https://github.com/acme/widgets/issues/42',
      escrowAddress: locked.escrowAddress,
      escrowSignature: locked.signature,
      escrowStatus: 'FUNDED',
      paidOutToId: null,
      paidOutAt: null,
      closedAt: null,
      createdAt,
    });

    await expect(service.create(input)).resolves.toEqual({
      id: 'issue_1',
      title: input.title,
      body: input.body,
      labels: [],
      rewardAmount: '9007199254740993',
      rewardSymbol: 'OMT',
      repoId: 'repo_1',
      githubIssueNumber: 42,
      githubIssueUrl: 'https://github.com/acme/widgets/issues/42',
      escrowAddress: locked.escrowAddress,
      escrowSignature: locked.signature,
      escrowStatus: 'FUNDED',
      paidOutToId: null,
      paidOutAt: null,
      closedAt: null,
      createdAt: createdAt.toISOString(),
    });
    expect(escrow.lockReward).toHaveBeenCalledWith(input.rewardAmount);
    expect(prisma.issue.create).toHaveBeenCalledWith({
      data: {
        title: input.title,
        body: input.body,
        rewardAmount: input.rewardAmount,
        rewardSymbol: 'OMT',
        githubRepoId: 'repo_1',
        escrowAddress: locked.escrowAddress,
        escrowSignature: locked.signature,
        escrowStatus: 'FUNDED',
      },
    });
    expect(github.createIssue).toHaveBeenCalledWith(
      { owner: 'acme', repo: 'widgets' },
      { title: input.title, body: input.body },
    );
    expect(prisma.issue.update).toHaveBeenCalledWith({
      where: { id: 'issue_1', githubIssueNumber: null },
      data: { githubIssueNumber: 42, githubIssueUrl: 'https://github.com/acme/widgets/issues/42' },
    });
  });

  it('stores the labels and applies them to the GitHub issue', async () => {
    const { service, prisma, github } = setup();
    prisma.issue.create.mockResolvedValue({ id: 'issue_1', title: input.title, body: input.body, labels: ['bug'] });
    prisma.issue.update.mockResolvedValue({ id: 'issue_1', labels: ['bug'], rewardAmount: input.rewardAmount, createdAt });

    await service.create({ ...input, labels: ['bug'] });

    expect(prisma.issue.create).toHaveBeenCalledWith({ data: expect.objectContaining({ labels: ['bug'] }) });
    expect(github.createIssue).toHaveBeenCalledWith(
      { owner: 'acme', repo: 'widgets' },
      { title: input.title, body: input.body, labels: ['bug'] },
    );
  });

  it('locks and saves nothing when no GitHub token is configured', async () => {
    const { service, prisma, github, escrow } = setup();
    github.assertCanCreateIssues.mockImplementation(() => {
      throw new ServiceUnavailableException();
    });

    await expect(service.create(input)).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(escrow.lockReward).not.toHaveBeenCalled();
    expect(prisma.issue.create).not.toHaveBeenCalled();
  });

  it('locks and saves nothing when escrow is not configured', async () => {
    const { service, prisma, escrow } = setup();
    escrow.assertConfigured.mockImplementation(() => {
      throw new ServiceUnavailableException();
    });

    await expect(service.create(input)).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(escrow.lockReward).not.toHaveBeenCalled();
    expect(prisma.issue.create).not.toHaveBeenCalled();
  });

  it('saves nothing and opens nothing on GitHub when locking the reward fails', async () => {
    const { service, prisma, github, escrow } = setup();
    escrow.lockReward.mockRejectedValue(new BadGatewayException());

    await expect(service.create(input)).rejects.toBeInstanceOf(BadGatewayException);
    expect(prisma.issue.create).not.toHaveBeenCalled();
    expect(github.createIssue).not.toHaveBeenCalled();
  });

  it('keeps the saved bounty unlinked and reports the error when GitHub fails', async () => {
    const { service, prisma, github } = setup();
    github.createIssue.mockRejectedValue(new BadGatewayException());

    await expect(service.create(input)).rejects.toBeInstanceOf(BadGatewayException);
    expect(prisma.issue.create).toHaveBeenCalled();
    expect(prisma.issue.update).not.toHaveBeenCalled();
  });

  it('returns not found for an unknown repo without locking or saving anything', async () => {
    const { service, prisma, github, escrow } = setup();
    prisma.githubRepo.findUnique.mockResolvedValue(null);

    await expect(service.create(input)).rejects.toBeInstanceOf(NotFoundException);
    expect(escrow.lockReward).not.toHaveBeenCalled();
    expect(prisma.issue.create).not.toHaveBeenCalled();
    expect(github.createIssue).not.toHaveBeenCalled();
  });

  it('returns not found when the repo disappears before the write', async () => {
    const { service, prisma } = setup();
    prisma.issue.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Foreign key failed', { code: 'P2003', clientVersion: 'test' }),
    );

    await expect(service.create(input)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('lets unexpected database errors propagate', async () => {
    const { service, prisma } = setup();
    const failure = new Error('connection lost');
    prisma.issue.create.mockRejectedValue(failure);

    await expect(service.create(input)).rejects.toBe(failure);
  });

  const stored = {
    id: 'issue_1',
    title: input.title,
    body: input.body,
    labels: [],
    rewardAmount: 5_000_000n,
    rewardSymbol: 'OMT',
    githubRepoId: 'repo_1',
    githubIssueNumber: 7,
    githubIssueUrl: 'https://github.com/acme/widgets/issues/7',
    escrowAddress: locked.escrowAddress,
    escrowSignature: locked.signature,
    escrowStatus: 'FUNDED',
    paidOutToId: 'account_1',
    paidOutAt: createdAt,
    closedAt: null,
    createdAt,
  };
  const response = {
    id: 'issue_1',
    title: input.title,
    body: input.body,
    labels: [],
    rewardAmount: '5000000',
    rewardSymbol: 'OMT',
    repoId: 'repo_1',
    githubIssueNumber: 7,
    githubIssueUrl: 'https://github.com/acme/widgets/issues/7',
    escrowAddress: locked.escrowAddress,
    escrowSignature: locked.signature,
    escrowStatus: 'FUNDED',
    paidOutToId: 'account_1',
    paidOutAt: createdAt.toISOString(),
    closedAt: null,
    createdAt: createdAt.toISOString(),
  };

  it('lists issues newest first', async () => {
    const { service, prisma } = setup();
    prisma.issue.findMany.mockResolvedValue([stored]);

    await expect(service.list()).resolves.toEqual([response]);
    expect(prisma.issue.findMany).toHaveBeenCalledWith({ orderBy: { createdAt: 'desc' } });
  });

  it('returns one issue by id', async () => {
    const { service, prisma } = setup();
    prisma.issue.findUnique.mockResolvedValue(stored);

    await expect(service.get('issue_1')).resolves.toEqual(response);
    expect(prisma.issue.findUnique).toHaveBeenCalledWith({ where: { id: 'issue_1' } });
  });

  it('returns not found for an unknown issue id', async () => {
    const { service, prisma } = setup();
    prisma.issue.findUnique.mockResolvedValue(null);

    await expect(service.get('missing')).rejects.toBeInstanceOf(NotFoundException);
  });

  describe('retryGithub', () => {
    const unlinked = {
      ...stored,
      githubIssueNumber: null,
      githubIssueUrl: null,
      githubRepo: { githubRepoName: 'acme/widgets' },
    };

    it('opens the missing GitHub issue and links it', async () => {
      const { service, prisma, github } = setup();
      prisma.issue.findUnique.mockResolvedValue(unlinked);
      prisma.issue.update.mockResolvedValue({
        ...stored,
        githubIssueNumber: 42,
        githubIssueUrl: 'https://github.com/acme/widgets/issues/42',
      });

      await expect(service.retryGithub('issue_1')).resolves.toMatchObject({
        githubIssueNumber: 42,
        githubIssueUrl: 'https://github.com/acme/widgets/issues/42',
      });
      expect(github.createIssue).toHaveBeenCalledWith(
        { owner: 'acme', repo: 'widgets' },
        { title: input.title, body: input.body },
      );
      expect(prisma.issue.update).toHaveBeenCalledWith({
        where: { id: 'issue_1', githubIssueNumber: null },
        data: { githubIssueNumber: 42, githubIssueUrl: 'https://github.com/acme/widgets/issues/42' },
      });
    });

    it('returns not found for an unknown issue', async () => {
      const { service, prisma, github } = setup();
      prisma.issue.findUnique.mockResolvedValue(null);

      await expect(service.retryGithub('missing')).rejects.toBeInstanceOf(NotFoundException);
      expect(github.createIssue).not.toHaveBeenCalled();
    });

    it('refuses an issue that is already on GitHub, without opening another', async () => {
      const { service, prisma, github } = setup();
      prisma.issue.findUnique.mockResolvedValue({ ...stored, githubRepo: { githubRepoName: 'acme/widgets' } });

      await expect(service.retryGithub('issue_1')).rejects.toBeInstanceOf(ConflictException);
      expect(github.createIssue).not.toHaveBeenCalled();
    });

    it('reports a conflict when another retry linked it first', async () => {
      const { service, prisma } = setup();
      prisma.issue.findUnique.mockResolvedValue(unlinked);
      prisma.issue.update.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Not found', { code: 'P2025', clientVersion: 'test' }),
      );

      await expect(service.retryGithub('issue_1')).rejects.toBeInstanceOf(ConflictException);
    });

    it('leaves the issue unlinked when GitHub fails again', async () => {
      const { service, prisma, github } = setup();
      prisma.issue.findUnique.mockResolvedValue(unlinked);
      github.createIssue.mockRejectedValue(new BadGatewayException());

      await expect(service.retryGithub('issue_1')).rejects.toBeInstanceOf(BadGatewayException);
      expect(prisma.issue.update).not.toHaveBeenCalled();
    });
  });
});
