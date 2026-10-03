import type { PrismaClient } from '../../src/generated/prisma/client';
import type { GithubApi } from './github-api';
import { findPullRequest, getRefSha, repoPath, requireRepo } from './repo-api';
import { formatTokens } from './reward';
import { reviewStatusOf } from './review-status';
import { findRepoRow } from './rows';
import type { Scenario } from './scenario';

export interface DemoStatus {
  repo: string;
  main: 'baseline' | 'changed';
  bounty: { number: number | null; reward: string; escrow: string } | null;
  pull: {
    number: number;
    state: 'open' | 'closed' | 'merged';
    head: 'v1' | 'v2' | 'other';
    url: string;
    /** What the app's database says; differs from GitHub until the webhook is processed. */
    appState: string | null;
  } | null;
  /** The OpenMerge commit status on the pull request's head, as GitHub shows it. */
  check: { state: string; description: string | null } | null;
  /** The app's own record of the review of that head commit. */
  review: { claude: string; gemini: string; ci: string } | null;
  payout: { released: boolean; signature: string | null } | null;
}

export interface StatusDeps {
  db: PrismaClient;
  /** Any token that can read the repository. */
  api: GithubApi;
  org: string;
  scenario: Scenario;
}

export async function collectStatus({ db, api, org, scenario }: StatusDeps): Promise<DemoStatus> {
  const name = scenario.repo.name;
  const base = repoPath(org, name);
  const repo = await requireRepo(api, org, name);
  const [mainSha, baselineSha, v1Sha, v2Sha] = await Promise.all([
    getRefSha(api, base, `heads/${repo.default_branch}`),
    getRefSha(api, base, `tags/${scenario.refs.baseline}`),
    getRefSha(api, base, `tags/${scenario.refs.v1}`),
    getRefSha(api, base, `tags/${scenario.refs.v2}`),
  ]);

  const row = await findRepoRow(db, org, name);
  const issue = row
    ? await db.issue.findFirst({ where: { githubRepoId: row.id }, orderBy: { createdAt: 'desc' }, include: { payout: true } })
    : null;
  const pull = await findPullRequest(api, base, org, scenario.branch);

  const appPull =
    row && pull
      ? await db.pullRequest.findUnique({
          where: { githubRepoId_number: { githubRepoId: row.id, number: pull.number } },
          include: { reviews: { where: { headSha: pull.head.sha }, include: { results: true } } },
        })
      : null;
  const review = appPull?.reviews[0];
  const verdictOf = (reviewer: string) => {
    if (!review) return 'none';
    const result = review.results.find((r) => r.reviewer === reviewer);
    return result?.verdict ?? (review.status === 'pending' ? 'pending' : 'error');
  };

  return {
    repo: repo.full_name,
    main: mainSha !== null && mainSha === baselineSha ? 'baseline' : 'changed',
    bounty: issue
      ? { number: issue.githubIssueNumber, reward: formatTokens(issue.rewardAmount), escrow: issue.escrowStatus }
      : null,
    pull: pull
      ? {
          number: pull.number,
          state: pull.merged_at ? 'merged' : pull.state,
          head: pull.head.sha === v1Sha ? 'v1' : pull.head.sha === v2Sha ? 'v2' : 'other',
          url: pull.html_url,
          appState: appPull?.state ?? null,
        }
      : null,
    check: pull ? await reviewStatusOf(api, base, pull.head.sha) : null,
    review: review ? { claude: verdictOf('claude'), gemini: verdictOf('gemini'), ci: review.ciState ?? 'pending' } : null,
    payout: issue ? payoutOf(issue) : null,
  };
}

function payoutOf(issue: { escrowStatus: string; payout: { releaseSignature: string | null; releasedAt: Date | null } | null }) {
  if (issue.escrowStatus === 'RELEASED') return { released: true, signature: issue.payout?.releaseSignature ?? null };
  return issue.payout ? { released: false, signature: null } : null;
}

/** What to do next, from where the demo stands. */
export function nextStep(status: DemoStatus): string {
  if (!status.bounty) return 'Create the bounty: web form (text in demo/issue.md) or pnpm demo:bounty';
  const { pull, check } = status;
  if (!pull) return 'Open the pull request: pnpm demo:pr';
  const reviewing = !check || check.state === 'pending';

  if (pull.state === 'closed') return 'The pull request was closed without a merge. Start over: pnpm demo:reset --yes';
  if (pull.state === 'merged') {
    if (status.payout?.released) return 'Done. For another take: pnpm demo:reset --yes';
    if (pull.appState !== 'merged') return 'Merged on GitHub, but the app has not recorded it: check the merge webhook delivery';
    return 'Merged and recorded. Waiting for the payout; if it never arrives, check the merge webhook handler logs';
  }
  if (pull.head === 'v1') return reviewing ? 'Wait for the review of the first fix to finish' : 'Push the finished fix: pnpm demo:fix';
  if (pull.head === 'v2') return reviewing ? 'Wait for the review of the finished fix' : 'Merge on GitHub (or pnpm demo:merge)';
  return 'The pull request head is not one of the demo commits. Start over: pnpm demo:reset --yes';
}

export function formatStatus(status: DemoStatus): string[] {
  const row = (label: string, text: string) => `${label.padEnd(13)}${text}`;
  const lines = [`${status.repo}: main ${status.main === 'baseline' ? 'is at the baseline' : 'is NOT at the baseline'}`];

  const { bounty, pull } = status;
  lines.push(row('Bounty', bounty ? `#${bounty.number ?? '?'} · ${bounty.reward} · escrow ${bounty.escrow}` : 'none'));
  lines.push(
    row(
      'Pull request',
      pull ? `#${pull.number} · ${pull.state} · ${pull.head === 'other' ? 'unknown head' : `head ${pull.head}`} · app sees ${pull.appState ?? 'nothing'}` : 'none',
    ),
  );
  if (pull) {
    lines.push(row('GitHub check', status.check ? `${status.check.state}: ${status.check.description ?? ''}`.trim() : 'not set yet'));
    lines.push(
      row('App review', status.review ? `claude ${status.review.claude} · gemini ${status.review.gemini} · CI ${status.review.ci}` : 'none recorded'),
    );
  }
  lines.push(row('Payout', status.payout ? (status.payout.released ? `released${status.payout.signature ? `, tx ${status.payout.signature}` : ''}` : 'held') : 'none'));
  lines.push('', `Next: ${nextStep(status)}`);
  return lines;
}
