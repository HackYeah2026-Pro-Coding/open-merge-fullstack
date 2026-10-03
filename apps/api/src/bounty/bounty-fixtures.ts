import { EscrowStatus } from '../generated/prisma/client';
import type { BountyRecord } from './bounty-query';

type PullRequestRecord = BountyRecord['pullRequests'][number];
type PayoutRecord = NonNullable<BountyRecord['payout']>;

export const at = (minute: number) => new Date(Date.UTC(2026, 9, 3, 12, minute));

export const REPO = {
  id: 'repo_1',
  githubRepoName: 'Acme/widgets',
  githubRepoUrl: 'https://github.com/Acme/widgets',
  description: 'Widgets for everyone',
  isPrivate: false,
  createdAt: at(0),
  updatedAt: at(0),
};

/** A funded bounty with nothing else happening yet; override what a test needs. */
export function bounty(over: Partial<BountyRecord> = {}): BountyRecord {
  return {
    id: 'issue_1',
    title: 'Trim emails before saving',
    body: 'Body',
    labels: ['bug'],
    rewardAmount: 50_000_000n,
    rewardSymbol: 'OMT',
    githubRepoId: REPO.id,
    githubIssueNumber: 7,
    githubIssueUrl: 'https://github.com/Acme/widgets/issues/7',
    escrowAddress: 'escrow1',
    escrowSignature: 'sig-fund',
    escrowStatus: EscrowStatus.FUNDED,
    paidOutToId: null,
    paidOutAt: null,
    closedAt: null,
    createdAt: at(1),
    updatedAt: at(1),
    githubRepo: REPO,
    payout: null,
    pullRequests: [],
    ...over,
  };
}

export function pull(over: Partial<PullRequestRecord> = {}): PullRequestRecord {
  return {
    id: 'pr_1',
    githubRepoId: REPO.id,
    issueId: 'issue_1',
    number: 12,
    title: 'fix: trim email',
    url: 'https://github.com/Acme/widgets/pull/12',
    authorLogin: 'ada',
    authorAvatarUrl: 'https://avatars.example/ada',
    state: 'open',
    headSha: 'sha1',
    openedAt: at(2),
    updatedAt: at(3),
    reviews: [],
    ...over,
  };
}

export function payout(over: Partial<PayoutRecord> = {}): PayoutRecord {
  return {
    id: 'payout_1',
    issueId: 'issue_1',
    recipientGithubId: 501,
    walletAddress: 'wallet1',
    releaseSignature: null,
    createdAt: at(4),
    releasedAt: null,
    recipient: {
      id: 'acc_ada',
      githubId: 501,
      githubLogin: 'ada',
      name: 'Ada',
      avatarUrl: 'https://avatars.example/ada',
      walletId: 'w1',
      createdAt: at(0),
      updatedAt: at(0),
    },
    ...over,
  };
}
