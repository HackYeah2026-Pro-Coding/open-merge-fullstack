import type { GithubRepo, Issue, Prisma, PrismaClient } from '../../src/generated/prisma/client';
import { UsageError } from './errors';
import type { RepoInfo } from './repo-api';

/** Deletes bounties and everything hanging off them, children first. Never touches accounts or wallets. */
export function deleteBounties(db: PrismaClient, where: Prisma.IssueWhereInput) {
  return db.$transaction([
    db.reviewerResult.deleteMany({ where: { review: { pullRequest: { issue: where } } } }),
    db.review.deleteMany({ where: { pullRequest: { issue: where } } }),
    db.payout.deleteMany({ where: { issue: where } }),
    db.pullRequest.deleteMany({ where: { issue: where } }),
    db.issue.deleteMany({ where }),
  ]);
}

/** Registers the repository so it can carry bounties, or refreshes what GitHub says about it. */
export function upsertRepoRow(db: PrismaClient, info: RepoInfo): Promise<GithubRepo> {
  const data = { githubRepoUrl: info.html_url, description: info.description, isPrivate: info.private };
  return db.githubRepo.upsert({
    where: { githubRepoName: info.full_name },
    update: data,
    create: { githubRepoName: info.full_name, ...data },
  });
}

export function findRepoRow(db: PrismaClient, org: string, name: string): Promise<GithubRepo | null> {
  return db.githubRepo.findFirst({ where: { githubRepoName: { equals: `${org}/${name}`, mode: 'insensitive' } } });
}

export async function requireRepoRow(db: PrismaClient, org: string, name: string): Promise<GithubRepo> {
  const row = await findRepoRow(db, org, name);
  if (!row) throw new UsageError(`${org}/${name} is not registered in the database yet. Run: pnpm demo:reset --yes`);
  return row;
}

/** The newest bounty of a repository that is already on GitHub. */
export function latestBounty(db: PrismaClient, repoId: string): Promise<Issue | null> {
  return db.issue.findFirst({
    where: { githubRepoId: repoId, githubIssueNumber: { not: null } },
    orderBy: { createdAt: 'desc' },
  });
}
