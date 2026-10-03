import { Injectable, Logger } from '@nestjs/common';
import { PayoutService, type PayoutRecipient } from '../payout/payout.service';
import { PrismaService } from '../prisma/prisma.service';
import { GithubReviewClient } from '../review/github-review.client';
import type { PullRequestEvent } from '../review/webhook-payload';

/** What the merge webhook did with a delivery, returned to GitHub for the delivery log. */
export type MergeResult = 'ignored' | 'updated' | 'releasing';

@Injectable()
export class MergeService {
  private readonly logger = new Logger(MergeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly github: GithubReviewClient,
    private readonly payouts: PayoutService,
  ) {}

  /** Records a closed pull request and, on a merge, pays the bounty it closes to the pull request's author. */
  async handleClosed(event: PullRequestEvent): Promise<MergeResult> {
    const pr = event.pull_request;
    if (event.action !== 'closed') return 'ignored';

    const repo = await this.prisma.githubRepo.findFirst({
      where: { githubRepoName: { equals: event.repository.full_name, mode: 'insensitive' } },
    });
    if (!repo) return 'ignored';

    const { count } = await this.prisma.pullRequest.updateMany({
      where: { githubRepoId: repo.id, number: pr.number },
      data: { state: pr.merged ? 'merged' : 'closed' },
    });
    if (!pr.merged) return count > 0 ? 'updated' : 'ignored';

    // Every merge pays, whatever the review said, so an unreviewed pull request counts too.
    const tracked = await this.prisma.pullRequest.findUnique({
      where: { githubRepoId_number: { githubRepoId: repo.id, number: pr.number } },
    });
    const issueId = tracked?.issueId ?? (await this.closedIssueId(repo.id, repo.githubRepoName, pr.number));
    if (!issueId) return count > 0 ? 'updated' : 'ignored';

    this.startPayout(issueId, { githubId: pr.user.id, login: pr.user.login });
    return 'releasing';
  }

  private async closedIssueId(repoId: string, fullName: string, number: number): Promise<string | undefined> {
    const [owner, repo] = fullName.split('/');
    const numbers = await this.github.closingIssueNumbers({ owner, repo }, number);
    if (numbers.length === 0) return undefined;
    const issue = await this.prisma.issue.findFirst({ where: { githubRepoId: repoId, githubIssueNumber: { in: numbers } } });
    return issue?.id;
  }

  /** In the background so the webhook answers inside GitHub's 10 second limit; a release waits for on-chain confirmation. */
  private startPayout(issueId: string, recipient: PayoutRecipient): void {
    this.payouts.releaseForMerge(issueId, recipient).then(
      (outcome) => this.logger.log(`Payout for issue ${issueId}: ${outcome}`),
      (error: unknown) => {
        // GitHub already has its answer, so the log is where this failure surfaces.
        this.logger.error(`Payout for issue ${issueId} failed`, error instanceof Error ? error.stack : String(error));
      },
    );
  }
}
