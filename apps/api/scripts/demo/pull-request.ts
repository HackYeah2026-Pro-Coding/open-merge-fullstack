import { EscrowStatus, type PrismaClient } from '../../src/generated/prisma/client';
import { UsageError } from './errors';
import type { GithubApi } from './github-api';
import type { Log } from './log';
import {
  findPullRequest,
  getRefSha,
  repoPath,
  requireRepo,
  requireTagSha,
  setRef,
  shortSha,
  type PullInfo,
} from './repo-api';
import { reviewStatusOf, waitForReview, type WaitOptions } from './review-status';
import { latestBounty, requireRepoRow } from './rows';
import { pullRequestBody, type Scenario } from './scenario';

interface Common {
  org: string;
  scenario: Scenario;
  log: Log;
}

export interface OpenPullRequestDeps extends Common {
  db: PrismaClient;
  /** The demo developer: the pull request's author, who is paid on merge. */
  dev: GithubApi;
}

/** Step 3: the developer branches from the first fix and opens a pull request that closes the bounty's issue. */
export async function openPullRequest(deps: OpenPullRequestDeps): Promise<PullInfo> {
  const { db, dev, org, scenario, log } = deps;
  const name = scenario.repo.name;
  const base = repoPath(org, name);

  const row = await requireRepoRow(db, org, name);
  const bounty = await latestBounty(db, row.id);
  if (!bounty?.githubIssueNumber) throw new UsageError('There is no bounty yet. Create it first (web form, or pnpm demo:bounty).');
  if (bounty.escrowStatus !== EscrowStatus.FUNDED) log(`WARNING: the bounty's escrow is ${bounty.escrowStatus}, not FUNDED`);

  if ((await getRefSha(dev, base, `heads/${scenario.branch}`)) !== null) {
    throw new UsageError(`The branch ${scenario.branch} already exists. Run: pnpm demo:reset --yes`);
  }
  const repo = await requireRepo(dev, org, name);
  await setRef(dev, base, `heads/${scenario.branch}`, await requireTagSha(dev, base, scenario.refs.v1), false);

  const pull = await dev.request<PullInfo>('POST', `${base}/pulls`, {
    title: scenario.pullRequest.title,
    head: scenario.branch,
    base: repo.default_branch,
    body: pullRequestBody(scenario, bounty.githubIssueNumber),
  });
  log(`Pull request #${pull.number} opened (closes #${bounty.githubIssueNumber}): ${pull.html_url}`);
  log('The review starts when GitHub delivers the webhook; with CI it takes a minute or two.');
  return pull;
}

async function requireOpenPull(api: GithubApi, base: string, deps: Common): Promise<PullInfo> {
  const pull = await findPullRequest(api, base, deps.org, deps.scenario.branch);
  if (!pull || pull.state !== 'open') throw new UsageError('There is no open pull request. Run: pnpm demo:pr');
  return pull;
}

export interface PushFixDeps extends Common {
  dev: GithubApi;
  /** Skip waiting for the first review (for rehearsals). */
  wait: boolean;
  waitOptions: WaitOptions;
}

/**
 * Step 5: the developer pushes the finished fix. Unless told not to, it first waits for the review
 * of the first fix to end, because a push during a review marks that review as superseded.
 */
export async function pushFix(deps: PushFixDeps): Promise<void> {
  const { dev, org, scenario, log } = deps;
  const base = repoPath(org, scenario.repo.name);
  const pull = await requireOpenPull(dev, base, deps);
  const v1 = await requireTagSha(dev, base, scenario.refs.v1);
  const v2 = await requireTagSha(dev, base, scenario.refs.v2);

  if (pull.head.sha === v2) {
    log(`Pull request #${pull.number} is already at the finished fix.`);
    return;
  }
  if (pull.head.sha !== v1) {
    throw new UsageError(`The head of #${pull.number} (${shortSha(pull.head.sha)}) is neither fix; reset and start again.`);
  }

  if (deps.wait) {
    const status = await waitForReview(dev, base, v1, deps.waitOptions, log);
    log(`Review of the first fix: ${status.state}${status.description ? ` (${status.description})` : ''}`);
    if (status.state === 'success') log('NOTE: the reviewers approved the incomplete fix, so the demo has no "changes requested" moment.');
  }

  await setRef(dev, base, `heads/${scenario.branch}`, v2, false);
  log(`Pushed the finished fix to ${scenario.branch}; the review of ${shortSha(v2)} starts now.`);
}

export interface MergeDeps extends Common {
  /** The maintainer. */
  admin: GithubApi;
}

/** Step 7: the maintainer merges, whatever the check says. */
export async function mergePullRequest(deps: MergeDeps): Promise<string> {
  const { admin, org, scenario, log } = deps;
  const base = repoPath(org, scenario.repo.name);
  const pull = await requireOpenPull(admin, base, deps);

  const status = await reviewStatusOf(admin, base, pull.head.sha);
  log(`Check on ${shortSha(pull.head.sha)}: ${status ? `${status.state} (${status.description ?? 'no description'})` : 'none yet'}`);

  const merged = await admin.request<{ sha: string }>('PUT', `${base}/pulls/${pull.number}/merge`, { merge_method: 'squash' });
  log(`Merged #${pull.number} as ${shortSha(merged.sha)}. The reward is released by the merge webhook.`);
  return merged.sha;
}
