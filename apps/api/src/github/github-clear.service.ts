import { BadGatewayException, BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { GithubRepoRef } from './github-repo-url';
import { GithubService } from './github.service';

/** Branch kept besides the repository's default branch. */
const KEPT_BRANCH = 'main';

const DELETE_ISSUE = `mutation DeleteIssue($id: ID!) {
  deleteIssue(input: { issueId: $id }) { clientMutationId }
}`;

export interface ClearFailure {
  /** What could not be cleared, e.g. "branch feature/x" or "issue #12". */
  target: string;
  message: string;
}

export interface ClearResult {
  repo: string;
  closedPullRequests: number[];
  deletedBranches: string[];
  keptBranches: string[];
  deletedIssues: number[];
  /** Issues with a bounty in our database, left alone so no locked reward loses its issue. */
  skippedBountyIssues: number[];
  /** Items GitHub refused; everything else was still cleared. */
  failures: ClearFailure[];
}

interface RestPull {
  number: number;
}
interface RestBranch {
  name: string;
}
interface RestIssue {
  number: number;
  node_id: string;
  /** Present when the "issue" is really a pull request. */
  pull_request?: unknown;
}

/**
 * Resets a stored repository on GitHub: closes open pull requests, deletes every
 * branch except `main` and the default one, and deletes issues. Pull requests
 * cannot be deleted on GitHub, so they stay as closed.
 */
@Injectable()
export class GithubClearService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly github: GithubService,
  ) {}

  async clear(ref: GithubRepoRef, confirm: string): Promise<ClearResult> {
    const slug = `${ref.owner}/${ref.repo}`;
    // Only repos added through POST /repo can be cleared.
    const stored = await this.prisma.githubRepo.findFirst({
      where: { githubRepoName: { equals: slug, mode: 'insensitive' } },
    });
    if (!stored) throw new NotFoundException(`Repository ${slug} is not added, so it cannot be cleared`);
    if (confirm.toLowerCase() !== stored.githubRepoName.toLowerCase()) {
      throw new BadRequestException(`confirm must be "${stored.githubRepoName}" to clear this repository`);
    }

    const base = `/repos/${encodeURIComponent(ref.owner)}/${encodeURIComponent(ref.repo)}`;
    const result: ClearResult = {
      repo: stored.githubRepoName,
      closedPullRequests: [],
      deletedBranches: [],
      keptBranches: [],
      deletedIssues: [],
      skippedBountyIssues: [],
      failures: [],
    };

    // Pull requests first: deleting a branch under an open PR closes it in a way that cannot be reopened.
    const pulls = await this.github.requestAll<RestPull>(`${base}/pulls?state=open`);
    for (const pull of pulls) {
      await this.attempt(result, `pull request #${pull.number}`, async () => {
        await this.github.request('PATCH', `${base}/pulls/${pull.number}`, { state: 'closed' });
        result.closedPullRequests.push(pull.number);
      });
    }

    const { default_branch } = await this.github.request<{ default_branch: string }>('GET', base);
    const kept = new Set([KEPT_BRANCH, default_branch]);
    const branches = await this.github.requestAll<RestBranch>(`${base}/branches`);
    for (const { name } of branches) {
      if (kept.has(name)) {
        result.keptBranches.push(name);
        continue;
      }
      await this.attempt(result, `branch ${name}`, async () => {
        const refPath = name.split('/').map(encodeURIComponent).join('/');
        await this.github.request('DELETE', `${base}/git/refs/heads/${refPath}`);
        result.deletedBranches.push(name);
      });
    }

    const bounties = await this.prisma.issue.findMany({
      where: { githubRepoId: stored.id, githubIssueNumber: { not: null } },
      select: { githubIssueNumber: true },
    });
    const bountyNumbers = new Set(bounties.map((b) => b.githubIssueNumber));
    // The issues endpoint also returns pull requests; those cannot be deleted.
    const issues = (await this.github.requestAll<RestIssue>(`${base}/issues?state=all`)).filter(
      (issue) => !issue.pull_request,
    );
    for (const issue of issues) {
      if (bountyNumbers.has(issue.number)) {
        result.skippedBountyIssues.push(issue.number);
        continue;
      }
      await this.attempt(result, `issue #${issue.number}`, async () => {
        await this.github.graphql(DELETE_ISSUE, { id: issue.node_id });
        result.deletedIssues.push(issue.number);
      });
    }

    return result;
  }

  /**
   * Runs one item's GitHub call. A refusal from GitHub (e.g. a protected branch) is
   * recorded in the result so the rest of the repo is still cleared; anything else propagates.
   */
  private async attempt(result: ClearResult, target: string, action: () => Promise<void>): Promise<void> {
    try {
      await action();
    } catch (error) {
      if (!(error instanceof BadGatewayException)) throw error;
      result.failures.push({ target, message: error.message });
    }
  }
}
