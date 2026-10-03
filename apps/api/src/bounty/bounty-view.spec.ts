import { EscrowStatus } from '../generated/prisma/client';
import { REPO, at, bounty, payout, pull } from './bounty-fixtures';
import { eventsOf, payoutOf, statsOf, statusOf, toBounty, toRepositorySummary, toSummary } from './bounty-view';

const OWNER = { login: 'acme-owner', avatarUrl: 'https://github.com/acme-owner.png' };
const merged = pull({ state: 'merged', updatedAt: at(5) });

describe('statusOf', () => {
  it.each([
    ['open without pull requests', bounty(), 'open'],
    ['in review with an open pull request', bounty({ pullRequests: [pull()] }), 'in_review'],
    ['open again once its only pull request closed unmerged', bounty({ pullRequests: [pull({ state: 'closed' })] }), 'open'],
    ['held when merged but nothing was released', bounty({ pullRequests: [merged] }), 'payout_held'],
    ['held while the release is unconfirmed', bounty({ pullRequests: [merged], payout: payout() }), 'payout_held'],
    [
      'paid once released',
      bounty({ pullRequests: [merged], payout: payout({ releasedAt: at(6) }), escrowStatus: EscrowStatus.RELEASED }),
      'paid',
    ],
    ['closed once the issue closed', bounty({ closedAt: at(9), pullRequests: [pull()] }), 'closed'],
  ] as const)('is %s', (_name, record, status) => {
    expect(statusOf(record)).toBe(status);
  });
});

describe('payoutOf', () => {
  it('is null before a merge', () => {
    expect(payoutOf(bounty({ pullRequests: [pull()] }))).toBeNull();
  });

  it('holds the reward for an author without a linked wallet', () => {
    expect(payoutOf(bounty({ pullRequests: [merged] }))).toEqual({
      recipient: { login: 'ada', avatarUrl: 'https://avatars.example/ada' },
      state: 'held',
      wallet: null,
      txSignature: null,
      reason: 'No wallet linked for @ada',
    });
  });

  it('reports the wallet and release transaction once paid', () => {
    const record = bounty({
      pullRequests: [merged],
      payout: payout({ releasedAt: at(6), releaseSignature: 'sig-release' }),
      escrowStatus: EscrowStatus.RELEASED,
    });
    expect(payoutOf(record)).toEqual({
      recipient: { login: 'ada', avatarUrl: 'https://avatars.example/ada' },
      state: 'released',
      wallet: 'wallet1',
      txSignature: 'sig-release',
      reason: null,
    });
  });
});

describe('eventsOf', () => {
  it('records the full path from funded to paid, oldest first', () => {
    const record = bounty({
      pullRequests: [merged],
      payout: payout({ releasedAt: at(6), releaseSignature: 'sig-release' }),
      escrowStatus: EscrowStatus.RELEASED,
    });
    const events = eventsOf(record, OWNER);
    expect(events.map((e) => e.type)).toEqual(['funded', 'pr_opened', 'merged', 'paid']);
    expect(events[0]).toMatchObject({ actor: OWNER, txSignature: 'sig-fund', at: at(1).toISOString() });
    expect(events[1]).toMatchObject({ actor: { login: 'ada' }, prNumber: 12 });
    expect(events[2]).toMatchObject({ prNumber: 12, commitSha: 'sha1', at: at(5).toISOString() });
    expect(events[3]).toMatchObject({ actor: { login: 'ada' }, txSignature: 'sig-release', at: at(6).toISOString() });
  });

  it('says why a payout is held', () => {
    const events = eventsOf(bounty({ pullRequests: [merged] }), OWNER);
    expect(events.at(-1)).toMatchObject({ type: 'payout_held', note: 'No wallet linked for @ada' });
  });

  it('has no funded event while the escrow is unverified, and a refund when closed', () => {
    const events = eventsOf(bounty({ escrowStatus: EscrowStatus.PENDING, closedAt: at(9) }), OWNER);
    expect(events.map((e) => e.type)).toEqual(['refunded']);
  });
});

describe('toSummary and toBounty', () => {
  it('names the repository within the organization and links the issue', () => {
    const summary = toSummary(bounty({ pullRequests: [pull()] }));
    expect(summary).toMatchObject({
      repository: { name: 'widgets', fullName: 'Acme/widgets', url: 'https://github.com/Acme/widgets' },
      issue: { number: 7, url: 'https://github.com/Acme/widgets/issues/7' },
      reward: { amount: '50000000', symbol: 'OMT', decimals: 6 },
      submissionCount: 1,
      updatedAt: at(3).toISOString(),
    });
  });

  it('refuses a bounty without a GitHub issue', () => {
    expect(() => toSummary(bounty({ githubIssueNumber: null }))).toThrow('has no GitHub issue');
  });

  it('carries the body, owner, submissions and history', () => {
    const full = toBounty(bounty({ pullRequests: [pull()] }), OWNER);
    expect(full.createdBy).toEqual(OWNER);
    expect(full.submissions).toEqual([expect.objectContaining({ prNumber: 12, check: { state: 'not_run', reviewers: [] } })]);
    expect(full.events.map((e) => e.type)).toEqual(['funded', 'pr_opened']);
  });
});

describe('statsOf and toRepositorySummary', () => {
  const bounties = [
    bounty({ id: 'a', rewardAmount: 10n }),
    bounty({ id: 'b', rewardAmount: 20n, pullRequests: [pull()] }),
    bounty({ id: 'c', rewardAmount: 40n, pullRequests: [merged] }),
    bounty({ id: 'd', rewardAmount: 80n, payout: payout({ releasedAt: at(6) }), pullRequests: [merged] }),
    bounty({ id: 'e', rewardAmount: 160n, closedAt: at(9) }),
  ];

  it('counts locked, paid and held rewards in base units', () => {
    expect(statsOf(bounties)).toEqual({
      locked: { amount: '70', symbol: 'OMT', decimals: 6 },
      paid: { amount: '80', symbol: 'OMT', decimals: 6 },
      openCount: 2,
      paidCount: 1,
      heldCount: 1,
    });
  });

  it('dates a repository by its latest event', () => {
    const summary = toRepositorySummary(REPO, bounties, OWNER);
    expect(summary).toMatchObject({ name: 'widgets', description: 'Widgets for everyone', isPrivate: false });
    expect(summary.lastActivityAt).toBe(at(9).toISOString());
    expect(toRepositorySummary(REPO, [], OWNER).lastActivityAt).toBeNull();
  });
});
