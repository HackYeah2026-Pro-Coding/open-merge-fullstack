import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, type Issue } from '../generated/prisma/client';
import { GithubService } from '../github/github.service';
import { PrismaService } from '../prisma/prisma.service';

/** Every bounty is paid in the project's own token for now. */
export const DEFAULT_REWARD_SYMBOL = 'OMT';

export interface CreateIssueInput {
  title: string;
  body: string;
  /** Integer base units of the reward token. */
  rewardAmount: bigint;
  repoId: string;
}

export interface IssueResponse {
  id: string;
  title: string;
  body: string;
  labels: string[];
  /** Integer base units serialised from a BigInt, never a float. */
  rewardAmount: string;
  rewardSymbol: string;
  repoId: string;
  /** Null when the bounty was saved but opening it on GitHub failed. */
  githubIssueNumber: number | null;
  githubIssueUrl: string | null;
  paidOutToId: string | null;
  paidOutAt: string | null;
  closedAt: string | null;
  createdAt: string;
}

function toResponse(issue: Issue): IssueResponse {
  return {
    id: issue.id,
    title: issue.title,
    body: issue.body,
    labels: issue.labels,
    rewardAmount: issue.rewardAmount.toString(),
    rewardSymbol: issue.rewardSymbol,
    repoId: issue.githubRepoId,
    githubIssueNumber: issue.githubIssueNumber,
    githubIssueUrl: issue.githubIssueUrl,
    paidOutToId: issue.paidOutToId,
    paidOutAt: issue.paidOutAt?.toISOString() ?? null,
    closedAt: issue.closedAt?.toISOString() ?? null,
    createdAt: issue.createdAt.toISOString(),
  };
}

@Injectable()
export class IssueService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly github: GithubService,
  ) {}

  async list(): Promise<IssueResponse[]> {
    const issues = await this.prisma.issue.findMany({ orderBy: { createdAt: 'desc' } });
    return issues.map(toResponse);
  }

  async get(id: string): Promise<IssueResponse> {
    const issue = await this.prisma.issue.findUnique({ where: { id } });
    if (!issue) throw new NotFoundException(`Issue ${id} does not exist`);
    return toResponse(issue);
  }

  async create(input: CreateIssueInput): Promise<IssueResponse> {
    // Checked before the reward is locked, so a bad repo id never moves funds.
    const repo = await this.prisma.githubRepo.findUnique({ where: { id: input.repoId } });
    if (!repo) throw new NotFoundException(`Repository ${input.repoId} does not exist`);
    this.github.assertCanCreateIssues();

    // TODO(solana): lock input.rewardAmount in escrow before saving. Assumed to succeed for now.

    let issue: Issue;
    try {
      issue = await this.prisma.issue.create({
        data: {
          title: input.title,
          body: input.body,
          rewardAmount: input.rewardAmount,
          rewardSymbol: DEFAULT_REWARD_SYMBOL,
          githubRepoId: input.repoId,
        },
      });
    } catch (error) {
      // The repo was deleted between the check above and this write.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
        throw new NotFoundException(`Repository ${input.repoId} does not exist`);
      }
      throw error;
    }

    // A failure here propagates and leaves the saved bounty without a GitHub issue
    // (githubIssueNumber stays null); the locked reward must not be lost with it.
    // retryGithub() opens it later.
    return toResponse(await this.openOnGithub(issue, repo.githubRepoName));
  }

  /** Opens the GitHub issue for a bounty whose earlier attempt failed. */
  async retryGithub(id: string): Promise<IssueResponse> {
    const issue = await this.prisma.issue.findUnique({ where: { id }, include: { githubRepo: true } });
    if (!issue) throw new NotFoundException(`Issue ${id} does not exist`);
    if (issue.githubIssueNumber !== null) {
      throw new ConflictException(`Issue ${id} is already on GitHub as ${issue.githubIssueUrl}`);
    }
    this.github.assertCanCreateIssues();
    return toResponse(await this.openOnGithub(issue, issue.githubRepo.githubRepoName));
  }

  private async openOnGithub(issue: Issue, repoName: string): Promise<Issue> {
    const [owner, repo] = repoName.split('/');
    const opened = await this.github.createIssue({ owner, repo }, { title: issue.title, body: issue.body });

    try {
      // Only links an issue that is still unlinked, so two concurrent retries cannot overwrite each other.
      return await this.prisma.issue.update({
        where: { id: issue.id, githubIssueNumber: null },
        data: { githubIssueNumber: opened.number, githubIssueUrl: opened.htmlUrl },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        throw new ConflictException(
          `Issue ${issue.id} was linked or deleted meanwhile; ${opened.htmlUrl} was opened but not saved`,
        );
      }
      throw error;
    }
  }
}
