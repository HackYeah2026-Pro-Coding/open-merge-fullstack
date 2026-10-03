import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { EscrowStatus, Prisma, type Issue } from '../generated/prisma/client';
import { GithubService } from '../github/github.service';
import { PrismaService } from '../prisma/prisma.service';
import { EscrowService } from '../solana/escrow.service';

/** Every bounty is paid in the project's own token for now. */
export const DEFAULT_REWARD_SYMBOL = 'OMT';

export interface CreateIssueInput {
  title: string;
  body: string;
  /** Integer base units of the reward token. */
  rewardAmount: bigint;
  repoId: string;
  /** Also applied to the GitHub issue. */
  labels?: string[];
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
  /** Base58 address of the on-chain escrow holding the reward. */
  escrowAddress: string | null;
  escrowSignature: string | null;
  escrowStatus: EscrowStatus;
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
    escrowAddress: issue.escrowAddress,
    escrowSignature: issue.escrowSignature,
    escrowStatus: issue.escrowStatus,
    paidOutToId: issue.paidOutToId,
    paidOutAt: issue.paidOutAt?.toISOString() ?? null,
    closedAt: issue.closedAt?.toISOString() ?? null,
    createdAt: issue.createdAt.toISOString(),
  };
}

@Injectable()
export class IssueService {
  private readonly logger = new Logger(IssueService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly github: GithubService,
    private readonly escrow: EscrowService,
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
    this.escrow.assertConfigured();

    // A failure here propagates before anything is saved.
    const locked = await this.escrow.lockReward(input.rewardAmount);

    let issue: Issue;
    try {
      issue = await this.prisma.issue.create({
        data: {
          title: input.title,
          body: input.body,
          labels: input.labels,
          rewardAmount: input.rewardAmount,
          rewardSymbol: DEFAULT_REWARD_SYMBOL,
          githubRepoId: input.repoId,
          escrowAddress: locked.escrowAddress,
          escrowSignature: locked.signature,
          escrowStatus: EscrowStatus.FUNDED,
        },
      });
    } catch (error) {
      // The reward is locked but nothing records where; the log is the only trace.
      this.logger.error(
        `Reward locked in escrow ${locked.escrowAddress} (tx ${locked.signature}) but the issue was not saved; cancel the escrow to refund it`,
        error instanceof Error ? error.stack : String(error),
      );
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
    const labels = issue.labels.length > 0 ? { labels: issue.labels } : {};
    const opened = await this.github.createIssue({ owner, repo }, { title: issue.title, body: issue.body, ...labels });

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
