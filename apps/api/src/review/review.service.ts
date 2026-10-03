import { ConflictException, Injectable, Logger, NotFoundException, type OnModuleInit } from '@nestjs/common';
import type { Submission } from '@escrow/shared';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { toCommitCheck } from './check-view';
import { GithubReviewClient } from './github-review.client';
import { ReviewRunner } from './review.runner';
import { REVIEW_ACTIONS, type PullRequestEvent } from './webhook-payload';

/** What the webhook did with a delivery, returned to GitHub for the delivery log. */
export type WebhookResult = 'ignored' | 'started' | 'duplicate' | 'updated';

const reviewInclude = { results: true } as const;

@Injectable()
export class ReviewService implements OnModuleInit {
  private readonly logger = new Logger(ReviewService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly github: GithubReviewClient,
    private readonly runner: ReviewRunner,
  ) {}

  /** A restart kills reviews in flight; mark them so the app offers a re-run instead of spinning forever. */
  async onModuleInit(): Promise<void> {
    const { count } = await this.prisma.review.updateMany({
      where: { status: 'pending' },
      data: { status: 'failed', error: 'Interrupted by a server restart', completedAt: new Date() },
    });
    if (count > 0) this.logger.warn(`Marked ${count} interrupted review(s) as failed`);
  }

  async handlePullRequest(event: PullRequestEvent): Promise<WebhookResult> {
    const pr = event.pull_request;
    const repo = await this.prisma.githubRepo.findFirst({
      where: { githubRepoName: { equals: event.repository.full_name, mode: 'insensitive' } },
    });
    if (!repo) return 'ignored';

    if (event.action === 'closed') {
      const { count } = await this.prisma.pullRequest.updateMany({
        where: { githubRepoId: repo.id, number: pr.number },
        data: { state: pr.merged ? 'merged' : 'closed' },
      });
      return count > 0 ? 'updated' : 'ignored';
    }
    if (!REVIEW_ACTIONS.has(event.action) || pr.draft) return 'ignored';

    const [owner, name] = repo.githubRepoName.split('/');
    const issue = await this.linkedIssue(repo.id, { owner, repo: name }, pr.number);
    if (!issue) return 'ignored';

    const pullRequest = await this.prisma.pullRequest.upsert({
      where: { githubRepoId_number: { githubRepoId: repo.id, number: pr.number } },
      create: {
        githubRepoId: repo.id,
        issueId: issue.id,
        number: pr.number,
        title: pr.title,
        url: pr.html_url,
        authorLogin: pr.user.login,
        authorAvatarUrl: pr.user.avatar_url ?? null,
        headSha: pr.head.sha,
      },
      update: {
        issueId: issue.id,
        title: pr.title,
        url: pr.html_url,
        authorLogin: pr.user.login,
        authorAvatarUrl: pr.user.avatar_url ?? null,
        state: 'open',
        headSha: pr.head.sha,
      },
    });

    try {
      const review = await this.prisma.review.create({ data: { pullRequestId: pullRequest.id, headSha: pr.head.sha } });
      this.start(review.id);
      return 'started';
    } catch (error) {
      // The unique key on (pull request, commit) means GitHub redelivered an event we already handled.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return 'duplicate';
      throw error;
    }
  }

  async listSubmissions(issueId: string): Promise<Submission[]> {
    if (!(await this.prisma.issue.findUnique({ where: { id: issueId } }))) {
      throw new NotFoundException(`Issue ${issueId} does not exist`);
    }
    const pulls = await this.prisma.pullRequest.findMany({
      where: { issueId },
      orderBy: { openedAt: 'desc' },
      include: { reviews: { include: reviewInclude, orderBy: { createdAt: 'desc' } } },
    });
    return pulls.map((pr) => {
      // Reviews are listed newest first; the one for the current head commit is what the app shows.
      const review = pr.reviews.find((r) => r.headSha === pr.headSha);
      const check = toCommitCheck(review);
      return {
        id: pr.id,
        prNumber: pr.number,
        title: pr.title,
        url: pr.url,
        author: { login: pr.authorLogin, avatarUrl: pr.authorAvatarUrl },
        state: pr.state,
        headSha: pr.headSha,
        check,
        ci: review?.ciState ? { state: review.ciState, failedJobs: review.failedJobs } : null,
        retryableReviewId: review && check.state === 'error' ? review.id : null,
        reviewedAt: review?.completedAt?.toISOString() ?? null,
        openedAt: pr.openedAt.toISOString(),
        updatedAt: pr.updatedAt.toISOString(),
      };
    });
  }

  /** Runs a review again. Only for reviews that ended in an error, so it cannot be used to spend money on a good result. */
  async rerun(reviewId: string): Promise<void> {
    const review = await this.prisma.review.findUnique({ where: { id: reviewId }, include: reviewInclude });
    if (!review) throw new NotFoundException(`Review ${reviewId} does not exist`);
    if (toCommitCheck(review).state !== 'error') {
      throw new ConflictException('Only a review that ended in an error can be run again');
    }
    // Claims the review atomically: two clicks cannot start two runs.
    const claimed = await this.prisma.review.updateMany({
      where: { id: reviewId, status: { not: 'pending' } },
      data: { status: 'pending', error: null, completedAt: null },
    });
    if (claimed.count === 0) throw new ConflictException('This review is already running');
    this.start(reviewId);
  }

  private async linkedIssue(repoId: string, slug: { owner: string; repo: string }, number: number) {
    const numbers = await this.github.closingIssueNumbers(slug, number);
    if (numbers.length === 0) return null;
    return this.prisma.issue.findFirst({ where: { githubRepoId: repoId, githubIssueNumber: { in: numbers } } });
  }

  /** Runs in the background so the webhook answers inside GitHub's 10 second limit. */
  private start(reviewId: string): void {
    this.runner.run(reviewId).catch((error: unknown) => {
      // run() records its own failures; reaching here means even that write failed.
      this.logger.error(`Review ${reviewId} could not even record its failure: ${String(error)}`);
    });
  }
}
