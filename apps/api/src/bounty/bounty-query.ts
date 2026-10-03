import type { Prisma } from '../generated/prisma/client';
import { submissionInclude } from '../review/submission-view';

/** Everything a bounty view is built from, loaded in one query. */
export const bountyInclude = {
  githubRepo: true,
  payout: { include: { recipient: true } },
  pullRequests: { include: submissionInclude, orderBy: { openedAt: 'desc' } },
} as const satisfies Prisma.IssueInclude;

export type BountyRecord = Prisma.IssueGetPayload<{ include: typeof bountyInclude }>;

/** Repositories of the organization: stored names are "owner/name" in GitHub's casing. */
export function orgRepos(org: string): Prisma.GithubRepoWhereInput {
  return { githubRepoName: { startsWith: `${org}/`, mode: 'insensitive' } };
}

/** One repository of the organization, by its name within it. */
export function orgRepo(org: string, name: string): Prisma.GithubRepoWhereInput {
  return { githubRepoName: { equals: `${org}/${name}`, mode: 'insensitive' } };
}

/**
 * Bounties the app lists. One without a GitHub issue (opening it failed) has no
 * number to link to, so it stays out until POST /issue/:id/github fixes it.
 */
export function listedBounties(repo: Prisma.GithubRepoWhereInput): Prisma.IssueWhereInput {
  return { githubIssueNumber: { not: null }, githubRepo: repo };
}
