import type { PrismaClient } from '../../src/generated/prisma/client';
import { createBounty } from './bounty';
import type { GithubApi } from './github-api';
import { pushFixBranch, recreateRepo, requireBotAccess } from './live-repo';
import type { Log } from './log';
import { ensureDeveloperAccess } from './publish';
import { removeBounties } from './reset';
import { findRepoRow, upsertRepoRow } from './rows';
import { pullRequestBody, type Scenario } from './scenario';
import { stageFiles, type RepoFile, type Stage } from './stages';

export interface PrepareDeps {
  db: PrismaClient;
  /** Deletes and creates the repositories. */
  admin: GithubApi;
  /** The developer: writes the fix on both repos' branches. */
  dev: GithubApi;
  /** The API's own token, checked so the take does not fail on stage. */
  bot: GithubApi;
  org: string;
  scenario: Scenario;
  apiUrl: string;
  webUrl: string;
  orphanFile: string;
  /** Used between attempts to re-create a repository GitHub has just deleted. */
  sleep: (ms: number) => Promise<void>;
  fetchFn?: typeof fetch;
  filesOf?: (stage: Stage) => RepoFile[];
  log: Log;
}

export interface PrepareResult {
  /** Opens the live pull request form, title and "Closes #1" filled in. */
  liveCompareUrl: string;
  /** Opens the twin's pull request form; open it by hand before the presentation. */
  twinCompareUrl: string;
  twinBountyUrl: string;
}

/** A fresh repo's first issue is the bounty the organizer creates on stage. */
const LIVE_ISSUE_NUMBER = 1;

/**
 * Sets up one take of the live presentation:
 *   live repo  re-created with the bug on main and the developer's fix pushed to a branch, and absent
 *              from the app, so the organizer adds it, creates the bounty and the developer opens the PR
 *   twin repo  re-created the same way, with its bounty created and the fix on a branch; the team opens
 *              its pull request by hand before the presentation, so the review is done by the time the
 *              live one starts, and merges it on stage for the payout
 * Database rows go first and only for these two repos; accounts and wallets stay.
 */
export async function prepare(deps: PrepareDeps): Promise<PrepareResult> {
  const { db, admin, dev, bot, org, scenario, log } = deps;
  const filesOf = deps.filesOf ?? ((stage: Stage) => stageFiles(stage));
  const live = scenario.repo.name;
  const twin = scenario.live.twinRepo;
  const { title } = scenario.pullRequest;
  const fixMessage = (issueNumber: number) => `${title}\n\n${pullRequestBody(scenario, issueNumber)}`;
  const recreate = (name: string, description: string) =>
    recreateRepo({
      admin,
      org,
      name,
      description,
      private: scenario.repo.private,
      files: filesOf('base'),
      message: scenario.commits.baseline,
      sleep: deps.sleep,
      log,
    });

  for (const name of [live, twin]) {
    const row = await findRepoRow(db, org, name);
    if (!row) continue;
    await removeBounties(db, row.id, row.githubRepoName, deps.orphanFile, log);
    // The organizer adds the live repo on stage, so it must not be in the app beforehand.
    if (name === live) await db.githubRepo.delete({ where: { id: row.id } });
  }
  log('Database: bounties of both repos removed, the live repo is no longer in the app');

  // Twin: the same story, up to the branch; its pull request is opened by hand ahead of the show.
  const twinRepo = await recreate(twin, scenario.live.twinDescription);
  await ensureDeveloperAccess(admin, dev, org, twin, log);
  await requireBotAccess(bot, org, twin);
  await upsertRepoRow(db, twinRepo.repo);
  const bounty = await createBounty({ db, org, apiUrl: deps.apiUrl, scenario, repoName: twin, fetchFn: deps.fetchFn, log });
  await pushFixBranch(dev, org, twin, scenario.branch, twinRepo.baseline, filesOf('v2'), fixMessage(bounty.number));

  // Live: everything up to the moment the organizer takes over.
  const liveRepo = await recreate(live, scenario.repo.description);
  await ensureDeveloperAccess(admin, dev, org, live, log);
  await requireBotAccess(bot, org, live);
  await pushFixBranch(dev, org, live, scenario.branch, liveRepo.baseline, filesOf('v2'), fixMessage(LIVE_ISSUE_NUMBER));

  /** GitHub's compare page with the pull request form open and filled in. */
  const compareUrl = (name: string, defaultBranch: string, issueNumber: number) => {
    const query = new URLSearchParams({ expand: '1', title, body: pullRequestBody(scenario, issueNumber) });
    return `https://github.com/${org}/${name}/compare/${defaultBranch}...${scenario.branch}?${query}`;
  };
  const result: PrepareResult = {
    liveCompareUrl: compareUrl(live, liveRepo.repo.default_branch, LIVE_ISSUE_NUMBER),
    twinCompareUrl: compareUrl(twin, twinRepo.repo.default_branch, bounty.number),
    twinBountyUrl: `${deps.webUrl}/bounties/${twin}/${bounty.number}`,
  };
  log('');
  log('Ready. Before the presentation, open the twin PR as the developer and wait until its bounty page shows the verdict:');
  log(`  Twin PR (open now)   ${result.twinCompareUrl}`);
  log(`  Twin bounty          ${result.twinBountyUrl}`);
  log(`  Live repo            https://github.com/${org}/${live} (not in the app: add it on stage, then create the bounty)`);
  log(`  Live PR (on stage)   ${result.liveCompareUrl}`);
  return result;
}
