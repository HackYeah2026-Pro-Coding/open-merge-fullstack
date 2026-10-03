import { EscrowStatus, type PrismaClient } from '../../src/generated/prisma/client';
import type { GithubApi } from './github-api';
import type { Log } from './log';
import { recordOrphanedEscrows } from './orphans';
import { clearRepo } from './repo-clear';
import { getRefSha, repoPath, requireRepo, requireTagSha, setRef, shortSha } from './repo-api';
import { formatTokens } from './reward';
import { deleteBounties, upsertRepoRow } from './rows';
import type { Scenario } from './scenario';

export interface ResetDeps {
  db: PrismaClient;
  /** An organization admin: closes pull requests, deletes issues and force-moves main. */
  admin: GithubApi;
  org: string;
  scenario: Scenario;
  /** Where escrows left locked by the reset are written down. */
  orphanFile: string;
  log: Log;
}

/** Deletes the repo's bounty rows, first writing down every escrow that still holds a reward. */
async function removeBounties(deps: ResetDeps, repoId: string, repoName: string): Promise<void> {
  const { db, orphanFile, log } = deps;
  const locked = await db.issue.findMany({
    where: { githubRepoId: repoId, escrowStatus: EscrowStatus.FUNDED, escrowAddress: { not: null } },
  });
  if (locked.length > 0) {
    recordOrphanedEscrows(
      orphanFile,
      locked.map((issue) => ({
        escrowAddress: issue.escrowAddress as string,
        rewardBaseUnits: issue.rewardAmount.toString(),
        repo: repoName,
        issueNumber: issue.githubIssueNumber,
        recordedAt: new Date().toISOString(),
      })),
    );
    const total = formatTokens(locked.reduce((sum, issue) => sum + issue.rewardAmount, 0n));
    log(`WARNING: ${locked.length} escrow(s) holding ${total} were never released and are now unreferenced; addresses are in ${orphanFile}`);
  }
  await deleteBounties(db, { githubRepoId: repoId });
}

/**
 * Returns the demo to "before the first step": no bounty, no pull request, main at the baseline.
 * Database first, so the GitHub cleanup is never blocked by a bounty row. Only this repo's rows are
 * touched; accounts and wallets stay, so the demo developer remains signed in with a wallet.
 */
export async function reset(deps: ResetDeps): Promise<void> {
  const { db, admin, org, scenario, log } = deps;
  const name = scenario.repo.name;
  const base = repoPath(org, name);

  // Checked before anything is deleted, so a repo that was never published fails cleanly.
  const repo = await requireRepo(admin, org, name);
  const baselineSha = await requireTagSha(admin, base, scenario.refs.baseline);
  const row = await upsertRepoRow(db, repo);

  await removeBounties(deps, row.id, repo.full_name);
  log('Database: bounties, pull requests, reviews and payouts of the repo removed');

  const cleared = await clearRepo(admin, org, name, repo.default_branch);
  log(
    `GitHub: closed ${cleared.closedPullRequests.length} pull request(s), deleted ${cleared.deletedBranches.length} branch(es) and ${cleared.deletedIssues.length} issue(s)`,
  );

  await setRef(admin, base, `heads/${repo.default_branch}`, baselineSha, true);
  log(`GitHub: ${repo.default_branch} reset to ${scenario.refs.baseline} (${shortSha(baselineSha)})`);

  await verifyClean(deps, row.id, repo.default_branch, baselineSha);
  log('Ready. Next: create the bounty (web form, or pnpm demo:bounty).');
}

async function verifyClean(deps: ResetDeps, repoId: string, defaultBranch: string, baselineSha: string): Promise<void> {
  const { db, admin, org, scenario } = deps;
  const base = repoPath(org, scenario.repo.name);
  const problems: string[] = [];

  const mainSha = await getRefSha(admin, base, `heads/${defaultBranch}`);
  if (mainSha !== baselineSha) problems.push(`${defaultBranch} is at ${mainSha ?? 'nothing'}, not the baseline`);
  const openPulls = await admin.requestAll(`${base}/pulls?state=open`);
  if (openPulls.length > 0) problems.push(`${openPulls.length} pull request(s) still open`);
  const issues = (await admin.requestAll<{ pull_request?: unknown }>(`${base}/issues?state=all`)).filter((i) => !i.pull_request);
  if (issues.length > 0) problems.push(`${issues.length} issue(s) still on GitHub`);
  const bounties = await db.issue.count({ where: { githubRepoId: repoId } });
  if (bounties > 0) problems.push(`${bounties} bounty row(s) still in the database`);

  if (problems.length > 0) throw new Error(`Reset finished but the demo is not clean: ${problems.join('; ')}`);
}
