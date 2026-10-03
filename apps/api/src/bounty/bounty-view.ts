import type {
  Bounty,
  BountyEvent,
  BountyStats,
  BountyStatus,
  BountySummary,
  GithubActor,
  Payout,
  RepositoryRef,
  RepositorySummary,
  TokenAmount,
} from '@escrow/shared';
import { EscrowStatus, type GithubRepo } from '../generated/prisma/client';
import { DEFAULT_REWARD_SYMBOL } from '../issue/issue.service';
import { toSubmission } from '../review/submission-view';
import type { BountyRecord } from './bounty-query';

/** Decimals of the reward mint (see anchor/README.md: 50 OMT = 50_000_000 base units). */
export const REWARD_DECIMALS = 6;

type PullRequestRecord = BountyRecord['pullRequests'][number];

function event(type: BountyEvent['type'], at: Date, extra: Partial<BountyEvent> = {}): BountyEvent {
  return { type, at: at.toISOString(), actor: null, prNumber: null, commitSha: null, txSignature: null, note: null, ...extra };
}

function author(pr: PullRequestRecord): GithubActor {
  return { login: pr.authorLogin, avatarUrl: pr.authorAvatarUrl };
}

/** The pull request that was merged; with several, the latest one. */
function mergedPull(b: BountyRecord): PullRequestRecord | undefined {
  return b.pullRequests
    .filter((pr) => pr.state === 'merged')
    .sort((x, y) => y.updatedAt.getTime() - x.updatedAt.getTime())[0];
}

function isPaid(b: BountyRecord): boolean {
  return b.escrowStatus === EscrowStatus.RELEASED || !!b.payout?.releasedAt;
}

export function statusOf(b: BountyRecord): BountyStatus {
  if (b.closedAt) return 'closed';
  if (isPaid(b)) return 'paid';
  if (b.payout || mergedPull(b)) return 'payout_held';
  if (b.pullRequests.some((pr) => pr.state === 'open')) return 'in_review';
  return 'open';
}

export function rewardOf(b: Pick<BountyRecord, 'rewardAmount' | 'rewardSymbol'>): TokenAmount {
  return { amount: b.rewardAmount.toString(), symbol: b.rewardSymbol, decimals: REWARD_DECIMALS };
}

/**
 * Who gets the reward and where it stands; null until a pull request is merged.
 * `reason` is a fragment without a final period: the web app sets it inside a sentence.
 */
export function payoutOf(b: BountyRecord): Payout | null {
  const merged = mergedPull(b);
  if (b.payout) {
    const released = isPaid(b);
    return {
      recipient: { login: b.payout.recipient.githubLogin, avatarUrl: b.payout.recipient.avatarUrl },
      state: released ? 'released' : 'held',
      wallet: b.payout.walletAddress,
      txSignature: b.payout.releaseSignature,
      reason: released ? null : 'Release transaction not confirmed yet',
    };
  }
  if (!merged) return null;
  // The merge webhook writes a payout row only once the author has a linked wallet.
  return {
    recipient: author(merged),
    state: 'held',
    wallet: null,
    txSignature: null,
    reason: `No wallet linked for @${merged.authorLogin}`,
  };
}

/** The bounty's history, oldest first, derived from what the database records. */
export function eventsOf(b: BountyRecord, owner: GithubActor): BountyEvent[] {
  const events: BountyEvent[] = [];
  if (b.escrowStatus !== EscrowStatus.PENDING) {
    events.push(event('funded', b.createdAt, { actor: owner, txSignature: b.escrowSignature }));
  }
  for (const pr of b.pullRequests) {
    events.push(event('pr_opened', pr.openedAt, { actor: author(pr), prNumber: pr.number }));
    // No merge timestamp is stored; a merged pull request is not updated again, so updatedAt is when it merged.
    if (pr.state === 'merged') {
      events.push(event('merged', pr.updatedAt, { prNumber: pr.number, commitSha: pr.headSha }));
    }
  }

  const payout = payoutOf(b);
  const merged = mergedPull(b);
  if (payout && merged) {
    const prNumber = merged.number;
    if (payout.state === 'released') {
      const at = b.payout?.releasedAt ?? b.paidOutAt ?? merged.updatedAt;
      events.push(event('paid', at, { actor: payout.recipient, prNumber, txSignature: payout.txSignature }));
    } else {
      const at = b.payout?.createdAt ?? merged.updatedAt;
      events.push(event('payout_held', at, { actor: payout.recipient, prNumber, note: payout.reason }));
    }
  }
  if (b.closedAt) events.push(event('refunded', b.closedAt, { note: 'Issue closed without a merge' }));
  return events.sort((x, y) => x.at.localeCompare(y.at));
}

export function toRepositoryRef(repo: Pick<GithubRepo, 'githubRepoName' | 'githubRepoUrl'>): RepositoryRef {
  return {
    name: repo.githubRepoName.slice(repo.githubRepoName.indexOf('/') + 1),
    fullName: repo.githubRepoName,
    url: repo.githubRepoUrl,
  };
}

function latest(dates: string[]): string | null {
  return dates.sort().at(-1) ?? null;
}

export function toSummary(b: BountyRecord): BountySummary {
  const number = b.githubIssueNumber;
  if (number === null) throw new Error(`Bounty ${b.id} has no GitHub issue; listedBounties() should have excluded it`);
  const repository = toRepositoryRef(b.githubRepo);
  const activity = b.pullRequests.map((pr) => pr.updatedAt.toISOString());
  return {
    id: b.id,
    title: b.title,
    repository,
    issue: { number, url: b.githubIssueUrl ?? `${repository.url}/issues/${number}` },
    status: statusOf(b),
    reward: rewardOf(b),
    labels: b.labels,
    submissionCount: b.pullRequests.length,
    createdAt: b.createdAt.toISOString(),
    updatedAt: latest([b.updatedAt.toISOString(), ...activity]) ?? b.updatedAt.toISOString(),
  };
}

export function toBounty(b: BountyRecord, owner: GithubActor): Bounty {
  return {
    ...toSummary(b),
    body: b.body,
    createdBy: owner,
    submissions: b.pullRequests.map(toSubmission),
    events: eventsOf(b, owner),
    payout: payoutOf(b),
  };
}

function sum(bounties: BountyRecord[]): TokenAmount {
  const amount = bounties.reduce((acc, b) => acc + b.rewardAmount, 0n);
  return { amount: amount.toString(), symbol: bounties[0]?.rewardSymbol ?? DEFAULT_REWARD_SYMBOL, decimals: REWARD_DECIMALS };
}

export function statsOf(bounties: BountyRecord[]): BountyStats {
  const by = (...statuses: BountyStatus[]) => bounties.filter((b) => statuses.includes(statusOf(b)));
  return {
    locked: sum(by('open', 'in_review', 'payout_held')),
    paid: sum(by('paid')),
    openCount: by('open', 'in_review').length,
    paidCount: by('paid').length,
    heldCount: by('payout_held').length,
  };
}

export function toRepositorySummary(repo: GithubRepo, bounties: BountyRecord[], owner: GithubActor): RepositorySummary {
  return {
    ...toRepositoryRef(repo),
    description: repo.description,
    isPrivate: repo.isPrivate,
    stats: statsOf(bounties),
    lastActivityAt: latest(bounties.flatMap((b) => eventsOf(b, owner).map((e) => e.at))),
  };
}
