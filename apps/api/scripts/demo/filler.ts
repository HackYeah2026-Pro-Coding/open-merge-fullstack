import type { Prisma, PrismaClient } from '../../src/generated/prisma/client';
import type { FillerAuthor, FillerData } from './filler-data';
import { fakeWalletAddress, planBounty, type PlanContext, type PlannedBounty } from './filler-rows';
import type { GithubApi } from './github-api';
import type { Log } from './log';
import { getRepo, repoPath, type RepoInfo } from './repo-api';
import { deleteBounties, upsertRepoRow } from './rows';

export interface FillerDeps {
  db: PrismaClient;
  /** Creates missing repositories in the organization. */
  admin: GithubApi;
  /** The bot the API itself uses, so filler issues are opened by the same account as real ones. */
  bot: GithubApi;
  org: string;
  filler: FillerData;
  context: PlanContext;
  log: Log;
}

interface OpenedIssue {
  number: number;
  html_url: string;
}

/** Account ids by login, with wallets linked for the authors who have one. */
async function ensureAuthors(db: PrismaClient, authors: FillerAuthor[]): Promise<Map<string, { id: string; githubId: number }>> {
  const accounts = new Map<string, { id: string; githubId: number }>();
  for (const author of authors) {
    const account = await db.githubAccount.upsert({
      where: { githubId: author.githubId },
      update: { name: author.name },
      create: { githubId: author.githubId, githubLogin: author.login, name: author.name },
    });
    if (author.wallet) {
      const address = fakeWalletAddress(author.login);
      const wallet = await db.wallet.upsert({ where: { address }, update: {}, create: { address } });
      await db.githubAccount.update({ where: { id: account.id }, data: { walletId: wallet.id } });
    }
    accounts.set(author.login, { id: account.id, githubId: account.githubId });
  }
  return accounts;
}

interface RepoRow {
  id: string;
  url: string;
}

function issueData(
  plan: PlannedBounty,
  repo: RepoRow,
  issue: OpenedIssue,
  author: { id: string; githubId: number } | undefined,
): Prisma.IssueUncheckedCreateInput {
  const { pull, payout } = plan;
  return {
    title: plan.title,
    body: plan.body,
    labels: plan.labels,
    rewardAmount: plan.rewardAmount,
    rewardSymbol: plan.rewardSymbol,
    githubRepoId: repo.id,
    githubIssueNumber: issue.number,
    githubIssueUrl: issue.html_url,
    // No escrow account exists on chain for filler, so there is no address or signature to show.
    escrowStatus: plan.escrowStatus,
    paidOutToId: payout ? author?.id : undefined,
    paidOutAt: plan.paidOutAt,
    closedAt: plan.closedAt,
    createdAt: plan.createdAt,
    updatedAt: plan.updatedAt,
    pullRequests: pull
      ? {
          create: {
            githubRepoId: repo.id,
            number: pull.number,
            title: pull.title,
            url: `${repo.url}/pull/${pull.number}`,
            authorLogin: plan.authorLogin as string,
            state: pull.state,
            headSha: pull.headSha,
            openedAt: pull.openedAt,
            updatedAt: pull.updatedAt,
            reviews: {
              create: {
                headSha: pull.headSha,
                status: 'completed',
                ciState: 'passed',
                createdAt: pull.openedAt,
                completedAt: pull.review.completedAt,
                results: {
                  create: pull.review.results.map((r) => ({
                    reviewer: r.reviewer,
                    model: r.model,
                    verdict: r.verdict,
                    output: r.output,
                    createdAt: pull.review.completedAt,
                  })),
                },
              },
            },
          },
        }
      : undefined,
    payout:
      payout && author
        ? { create: { recipientGithubId: author.githubId, walletAddress: payout.walletAddress, releasedAt: payout.releasedAt, createdAt: payout.releasedAt } }
        : undefined,
  };
}

/**
 * Fills the dashboard: registers the filler repos, then writes every bounty in demo/filler.json as
 * database rows in the state it names. Idempotent: a bounty that exists is rewritten in place and keeps
 * its GitHub issue. These bounties have no escrow on chain; they exist only to make the app look lived in.
 */
export async function runFiller(deps: FillerDeps): Promise<void> {
  const { db, admin, bot, org, filler, context, log } = deps;

  const repoRows = new Map<string, RepoRow>();
  for (const repo of filler.repos) {
    let info: RepoInfo | null = await getRepo(admin, org, repo.name);
    if (!info) {
      log(`Creating ${org}/${repo.name}`);
      // auto_init gives the repository a README, so it is not an empty shell when someone opens it.
      info = await admin.request<RepoInfo>('POST', `/orgs/${encodeURIComponent(org)}/repos`, {
        name: repo.name,
        description: repo.description,
        auto_init: true,
      });
    }
    const row = await upsertRepoRow(db, info);
    repoRows.set(repo.name, { id: row.id, url: row.githubRepoUrl });
  }

  const accounts = await ensureAuthors(db, filler.authors);

  for (const [index, entry] of filler.bounties.entries()) {
    const repo = repoRows.get(entry.repo) as RepoRow;
    const plan = planBounty(entry, index, context);

    const existing = await db.issue.findFirst({ where: { githubRepoId: repo.id, title: entry.title } });
    let issue: OpenedIssue;
    if (existing?.githubIssueNumber && existing.githubIssueUrl) {
      issue = { number: existing.githubIssueNumber, html_url: existing.githubIssueUrl };
      await deleteBounties(db, { id: existing.id });
    } else {
      if (existing) await deleteBounties(db, { id: existing.id });
      issue = await bot.request<OpenedIssue>('POST', `${repoPath(org, entry.repo)}/issues`, {
        title: entry.title,
        body: plan.body,
        labels: entry.labels,
      });
    }

    const author = entry.author ? accounts.get(entry.author) : undefined;
    await db.issue.create({ data: issueData(plan, repo, issue, author) });
    log(`${entry.repo}#${issue.number}  ${entry.state.padEnd(15)} ${entry.title}`);
  }
}
