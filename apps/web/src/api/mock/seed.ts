import type { CommitCheck, GithubActor, PullRequestState, ReviewVerdict, User } from '@escrow/shared';
import { env } from '@/lib/env';
import { event, fake } from './factory';
import { BODIES } from './seed-bodies';
import type { MockBounty, MockDb, MockSubmission } from './types';

const HOUR = 3_600_000;
const USDC = 1_000_000n;

function usdc(whole: number): string {
  return (BigInt(whole) * USDC).toString();
}

const MOCK_MAINTAINER_ID = 'u_maintainer';
/** The developer "Continue with GitHub" signs in as. */
export const MOCK_DEVELOPER_ID = 'u_tomek';

function users(at: (h: number) => string): User[] {
  const dev = (id: string, login: string, name: string, wallet: boolean): User => ({
    id,
    githubLogin: login,
    name,
    avatarUrl: null,
    role: 'developer',
    wallet: wallet ? { address: fake.address(), linkedAt: at(24 * 40) } : null,
  });
  return [
    {
      id: MOCK_MAINTAINER_ID,
      githubLogin: 'mkrawczyk',
      name: 'Marta Krawczyk',
      avatarUrl: null,
      role: 'maintainer',
      wallet: { address: fake.address(), linkedAt: at(24 * 45) },
    },
    // The developer persona starts without a wallet so linking can be demoed.
    dev(MOCK_DEVELOPER_ID, 'tomek-w', 'Tomasz Wójcik', false),
    dev('u_devon', 'devon-ray', 'Devon Ray', true),
    dev('u_ines', 'ines-park', 'Inés Park', true),
    dev('u_sam', 'sam-oduya', 'Sam Oduya', true),
  ];
}

const actor = (login: string): GithubActor => ({ login, avatarUrl: null });

function check(claude: ReviewVerdict, claudeSays: string | null, gemini: ReviewVerdict, geminiSays: string | null): CommitCheck {
  const verdicts = [claude, gemini];
  const state = verdicts.includes('pending')
    ? 'pending'
    : verdicts.every((v) => v === 'approve')
      ? 'passed'
      : 'failed';
  return {
    state,
    reviewers: [
      { reviewer: 'Claude', verdict: claude, summary: claudeSays },
      { reviewer: 'Gemini', verdict: gemini, summary: geminiSays },
    ],
  };
}

export function seedDatabase(now: Date): MockDb {
  const at = (hoursAgo: number) => new Date(now.getTime() - hoursAgo * HOUR).toISOString();
  const repoUrl = `https://github.com/${env.githubRepo}`;
  const maintainer = actor('mkrawczyk');

  const pr = (
    number: number,
    title: string,
    author: string,
    state: PullRequestState,
    openedH: number,
    updatedH: number,
    result: CommitCheck,
  ): MockSubmission => ({
    id: fake.id(),
    prNumber: number,
    title,
    url: `${repoUrl}/pull/${number}`,
    author: actor(author),
    state,
    headSha: fake.sha(),
    check: result,
    openedAt: at(openedH),
    updatedAt: at(updatedH),
    checkResolvesAt: null,
    checkOutcome: null,
  });

  const bounty = (
    issueNumber: number,
    title: string,
    body: string,
    reward: number,
    labels: string[],
    createdH: number,
    rest: Partial<MockBounty> = {},
  ): MockBounty => ({
    id: fake.id(),
    issueNumber,
    title,
    body,
    rewardAmount: usdc(reward),
    labels,
    createdBy: maintainer.login,
    createdAt: at(createdH),
    updatedAt: at(createdH),
    closedAt: null,
    submissions: [],
    events: [event('funded', at(createdH), { actor: maintainer, txSignature: fake.txSignature() })],
    payout: null,
    ...rest,
  });

  const withEvents = (b: MockBounty, updatedH: number): MockBounty => ({ ...b, updatedAt: at(updatedH) });

  // Paid: merged with a passing check, developer had a wallet.
  const dual = bounty(7, 'Ship dual ESM and CommonJS builds', BODIES.dualBuild, 900, ['feature', 'build'], 24 * 21);
  const dualPr = pr(34, 'build: emit ESM and CJS with conditional exports', 'devon-ray', 'merged', 24 * 18, 24 * 12,
    check('approve', 'Exports map is correct and both entry points are tested.', 'approve', 'Matches the acceptance criteria.'));
  const dualPaidTx = fake.txSignature();
  dual.submissions = [dualPr];
  dual.payout = { recipient: actor('devon-ray'), state: 'released', wallet: fake.address(), txSignature: dualPaidTx, reason: null };
  dual.events.push(
    event('pr_opened', dualPr.openedAt, { actor: dualPr.author, prNumber: 34 }),
    event('merged', at(24 * 12), { actor: maintainer, prNumber: 34, commitSha: dualPr.headSha }),
    event('paid', at(24 * 12 - 0.02), { actor: dualPr.author, prNumber: 34, txSignature: dualPaidTx }),
  );

  const leak = bounty(9, 'Memory leak in WebSocket reconnect loop', BODIES.memoryLeak, 1200, ['bug'], 24 * 19);
  const leakPr = pr(36, 'fix(ws): remove message listener on disconnect', 'ines-park', 'merged', 24 * 15, 24 * 6,
    check('approve', 'Leak fixed; the 1,000-reconnect test covers it.', 'approve', 'Clean change with a focused test.'));
  const leakPaidTx = fake.txSignature();
  leak.submissions = [leakPr];
  leak.payout = { recipient: actor('ines-park'), state: 'released', wallet: fake.address(), txSignature: leakPaidTx, reason: null };
  leak.events.push(
    event('pr_opened', leakPr.openedAt, { actor: leakPr.author, prNumber: 36 }),
    event('merged', at(24 * 6), { actor: maintainer, prNumber: 36, commitSha: leakPr.headSha }),
    event('paid', at(24 * 6 - 0.02), { actor: leakPr.author, prNumber: 36, txSignature: leakPaidTx }),
  );

  // Held: merged, but the developer persona has not linked a wallet yet.
  const glob = bounty(11, 'Glob matching fails on Windows paths with backslashes', BODIES.windowsGlob, 500, ['bug', 'windows'], 24 * 14);
  const globPr = pr(39, 'fix(glob): normalise path separators before matching', 'tomek-w', 'merged', 24 * 10, 26,
    check('approve', 'Separators normalised; Windows runner added to CI.', 'approve', 'Looks good.'));
  glob.submissions = [globPr];
  glob.payout = { recipient: actor('tomek-w'), state: 'held', wallet: null, txSignature: null, reason: 'No wallet linked for @tomek-w' };
  glob.events.push(
    event('pr_opened', globPr.openedAt, { actor: globPr.author, prNumber: 39 }),
    event('merged', at(26), { actor: maintainer, prNumber: 39, commitSha: globPr.headSha }),
    event('payout_held', at(26 - 0.02), { actor: globPr.author, prNumber: 39, note: 'No wallet linked for @tomek-w' }),
  );

  // In review: two competing pull requests, reviewers disagree on one.
  const retry = bounty(12, 'Retry queue drops jobs that time out mid-flight', BODIES.retryQueue, 750, ['bug', 'queue'], 24 * 9);
  const retryA = pr(41, 'fix(queue): count timeouts as failed attempts', 'sam-oduya', 'open', 24 * 5, 30,
    check('changes', 'Jobs can run twice if a worker restarts during backoff.', 'approve', 'Timeout path is handled and tested.'));
  const retryB = pr(43, 'fix(queue): retry timed-out jobs with idempotent re-enqueue', 'devon-ray', 'open', 20, 3,
    check('approve', 'Covers the restart case with a lease; regression test included.', 'approve', 'Meets all acceptance criteria.'));
  retry.submissions = [retryA, retryB];
  retry.events.push(
    event('pr_opened', retryA.openedAt, { actor: retryA.author, prNumber: 41 }),
    event('pr_opened', retryB.openedAt, { actor: retryB.author, prNumber: 43 }),
  );

  const durations = bounty(20, 'Parse ISO 8601 durations in schedule config', BODIES.isoDurations, 400, ['feature', 'config'], 24 * 3);
  const durationsPr = pr(46, 'feat(config): accept ISO 8601 durations', 'ines-park', 'open', 2, 0.05,
    check('pending', null, 'pending', null));
  durationsPr.checkResolvesAt = new Date(now.getTime() + 45_000).toISOString();
  durationsPr.checkOutcome = check('approve', 'Parser is strict and well tested.', 'approve', 'No new dependencies; numbers still work.');
  durations.submissions = [durationsPr];
  durations.events.push(event('pr_opened', durationsPr.openedAt, { actor: durationsPr.author, prNumber: 46 }));

  // Closed without a merge: reward returned.
  const intl = bounty(5, 'Replace moment.js with native Intl date formatting', BODIES.intl, 600, ['performance'], 24 * 26);
  const intlPr = pr(31, 'refactor: drop moment.js', 'lukas-b', 'closed', 24 * 20, 24 * 9, check('changes', 'Breaks locale fallbacks.', 'changes', 'Several tests removed.'));
  intl.submissions = [intlPr];
  intl.closedAt = at(24 * 9);
  intl.events.push(
    event('pr_opened', intlPr.openedAt, { actor: intlPr.author, prNumber: 31 }),
    event('refunded', at(24 * 9), { actor: maintainer, txSignature: fake.txSignature(), note: 'Issue closed as not planned' }),
  );

  const bounties: MockBounty[] = [
    withEvents(intl, 24 * 9),
    withEvents(dual, 24 * 12),
    withEvents(leak, 24 * 6),
    withEvents(glob, 26),
    withEvents(retry, 3),
    bounty(15, 'Add a --json flag to every CLI command', BODIES.jsonFlag, 300, ['feature', 'cli', 'good first issue'], 24 * 6),
    bounty(18, 'Document the plugin API with runnable examples', BODIES.pluginDocs, 150, ['docs'], 24 * 4),
    withEvents(durations, 0.05),
    bounty(22, 'Rate limiter ignores the Retry-After header', BODIES.retryAfter, 350, ['bug', 'good first issue'], 20),
    bounty(23, 'Stream large responses instead of buffering them', BODIES.streaming, 1000, ['performance'], 5),
  ];

  return {
    version: 2,
    users: users(at),
    bounties,
    sessionUserId: null,
    ownerView: false,
    nextIssueNumber: 24,
    nextPrNumber: 47,
  };
}
