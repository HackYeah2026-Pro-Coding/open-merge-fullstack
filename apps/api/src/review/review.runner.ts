import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { waitForCi, type CiResult, type CiWaitOptions } from './ci-status';
import { GithubReviewClient, type RepoSlug } from './github-review.client';
import { renderComment } from './pr-comment';
import { buildReviewContext } from './review-context';
import { REVIEWER_DISPLAY_NAME } from './review-output';
import { REVIEWERS, type Reviewer, type ReviewRequest } from './reviewers/reviewer';
import { snapshotLoader } from './tools/repo-snapshot';
import { ReviewToolExecutor } from './tools/tool-executor';
import { overallState, toCommitStatus, verdictOf, type ReviewerOutcome } from './verdict';

export const CI_WAIT_OPTIONS = Symbol('CI_WAIT_OPTIONS');

const reviewInclude = { pullRequest: { include: { issue: true, githubRepo: true } } } as const;
type ReviewRun = Prisma.ReviewGetPayload<{ include: typeof reviewInclude }>;

const errorMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error));

function describeOutcome(state: 'passed' | 'failed' | 'error', outcomes: ReviewerOutcome[]): string {
  if (state === 'passed') return 'Both reviewers approve';
  if (state === 'error') return 'Review incomplete: a reviewer gave no answer';
  const asking = outcomes.filter((o) => verdictOf(o) === 'changes').map((o) => REVIEWER_DISPLAY_NAME[o.reviewer]);
  return asking.length > 0 ? `Changes requested by ${asking.join(' and ')}` : 'Changes needed: CI failed';
}

/** Runs one review end to end: wait for CI, ask both models, publish the result. */
@Injectable()
export class ReviewRunner {
  private readonly logger = new Logger(ReviewRunner.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly github: GithubReviewClient,
    @Inject(REVIEWERS) private readonly reviewers: Reviewer[],
    @Inject(CI_WAIT_OPTIONS) private readonly ciWait: CiWaitOptions,
  ) {}

  /**
   * Never rejects for a failed review: the failure is recorded on the review, shown
   * in the app and on the commit, and the review can be run again.
   */
  async run(reviewId: string): Promise<void> {
    const review = await this.prisma.review.findUniqueOrThrow({ where: { id: reviewId }, include: reviewInclude });
    const slug = this.slugOf(review);
    try {
      await this.execute(review, slug);
    } catch (error) {
      this.logger.error(`Review ${reviewId} failed: ${errorMessage(error)}`);
      await this.prisma.review.update({
        where: { id: reviewId },
        data: { status: 'failed', error: errorMessage(error), completedAt: new Date() },
      });
      await this.github.setStatus(slug, review.headSha, { state: 'error', description: 'Review failed, it can be run again' });
    }
  }

  private async execute(review: ReviewRun, slug: RepoSlug): Promise<void> {
    const { pullRequest } = review;
    await this.github.setStatus(slug, review.headSha, { state: 'pending', description: 'Review in progress' });

    const ci = await waitForCi(this.github, slug, review.headSha, this.ciWait);

    const current = await this.github.getPullRequest(slug, pullRequest.number);
    if (current.headSha !== review.headSha) {
      // A newer push has its own review; asking the models about this commit would only cost money.
      await this.prisma.review.update({
        where: { id: review.id },
        data: { status: 'failed', ciState: ci.state, error: 'Superseded by a newer commit', completedAt: new Date() },
      });
      await this.github.setStatus(slug, review.headSha, { state: 'error', description: 'Superseded by a newer commit' });
      return;
    }

    const files = await this.github.listFiles(slug, pullRequest.number);
    const context = await buildReviewContext({
      issue: {
        // Reviews only start for PRs linked to an issue that is on GitHub.
        number: pullRequest.issue.githubIssueNumber as number,
        title: pullRequest.issue.title,
        body: pullRequest.issue.body,
      },
      pullRequest: { number: pullRequest.number, title: current.title, body: current.body },
      files,
      ci,
      readFile: (path) => this.github.fileContent(slug, path, review.headSha),
    });

    // Downloaded once, on the first tool call of either reviewer; each reviewer keeps its own call log and budget.
    const snapshot = snapshotLoader(() => this.github.tarball(slug, review.headSha));
    const outcomes = await Promise.all(
      this.reviewers.map((reviewer) =>
        this.ask(reviewer, { prompt: context.prompt, tools: new ReviewToolExecutor(snapshot, context.nonce) }),
      ),
    );
    await this.save(review.id, ci, context.notes, outcomes);

    const state = overallState(outcomes.map(verdictOf), ci.state);
    await this.github.setStatus(slug, review.headSha, {
      state: toCommitStatus(state),
      description: describeOutcome(state, outcomes),
    });

    // The status belongs to the commit and stays correct; the comment is shared, so only the latest commit writes it.
    const latest = await this.github.getPullRequest(slug, pullRequest.number);
    if (latest.headSha === review.headSha) {
      await this.github.upsertComment(
        slug,
        pullRequest.number,
        renderComment({ headSha: review.headSha, ci, outcomes }),
      );
    }
  }

  /** One reviewer's failure must not discard the other's answer, so it is recorded as its outcome. */
  private async ask(reviewer: Reviewer, request: ReviewRequest): Promise<ReviewerOutcome> {
    try {
      return { reviewer: reviewer.name, ok: true, answer: await reviewer.review(request) };
    } catch (error) {
      this.logger.warn(`${reviewer.name} gave no review: ${errorMessage(error)}`);
      return { reviewer: reviewer.name, ok: false, error: errorMessage(error) };
    }
  }

  private async save(
    reviewId: string,
    ci: CiResult,
    notes: string[],
    outcomes: ReviewerOutcome[],
  ): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.reviewerResult.deleteMany({ where: { reviewId } }),
      this.prisma.reviewerResult.createMany({
        data: outcomes.map((o) => ({
          reviewId,
          reviewer: o.reviewer,
          model: o.ok ? o.answer.model : null,
          verdict: verdictOf(o),
          output: o.ok ? o.answer.output : undefined,
          error: o.ok ? null : o.error,
          inputTokens: o.ok ? o.answer.inputTokens : null,
          outputTokens: o.ok ? o.answer.outputTokens : null,
          sources: o.ok ? o.answer.sources.map((s) => ({ ...s })) : undefined,
        })),
      }),
      this.prisma.review.update({
        where: { id: reviewId },
        data: {
          status: 'completed',
          ciState: ci.state,
          failedJobs: ci.failedJobs,
          contextNotes: notes,
          error: null,
          completedAt: new Date(),
        },
      }),
    ]);
  }

  private slugOf(review: ReviewRun): RepoSlug {
    const [owner, repo] = review.pullRequest.githubRepo.githubRepoName.split('/');
    return { owner, repo };
  }
}
