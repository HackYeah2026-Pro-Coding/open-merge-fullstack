import type { Bounty, BountyStats, BountyStatus, BountySummary, RepositoryRef, RepositorySummary, Submission } from '@escrow/shared';
import { env } from '@/lib/env';
import { CI_PASSED } from './reviews';
import { MOCK_TOKEN, type MockBounty, type MockRepository, type MockSubmission } from './types';

/** Settles pending checks whose time has come. Returns true when something changed. */
export function settleChecks(bounty: MockBounty, now: Date = new Date()): boolean {
  let changed = false;
  for (const s of bounty.submissions) {
    if (s.checkResolvesAt && s.checkOutcome && new Date(s.checkResolvesAt) <= now) {
      s.check = s.checkOutcome;
      s.ci = CI_PASSED;
      s.reviewedAt = now.toISOString();
      s.retryableReviewId = null;
      s.checkResolvesAt = null;
      s.checkOutcome = null;
      changed = true;
    }
  }
  return changed;
}

export function statusOf(b: MockBounty): BountyStatus {
  if (b.closedAt) return 'closed';
  if (b.payout?.state === 'released') return 'paid';
  if (b.payout?.state === 'held') return 'payout_held';
  if (b.submissions.some((s) => s.state === 'open')) return 'in_review';
  return 'open';
}

export function rewardOf(b: MockBounty) {
  return { amount: b.rewardAmount, ...MOCK_TOKEN };
}

export function repositoryRef(name: string): RepositoryRef {
  return { name, fullName: `${env.githubOrg}/${name}`, url: `https://github.com/${env.githubOrg}/${name}` };
}

function sum(bounties: MockBounty[]) {
  return { amount: bounties.reduce((acc, b) => acc + BigInt(b.rewardAmount), 0n).toString(), ...MOCK_TOKEN };
}

export function statsOf(bounties: MockBounty[]): BountyStats {
  const by = (...statuses: BountyStatus[]) => bounties.filter((b) => statuses.includes(statusOf(b)));
  return {
    locked: sum(by('open', 'in_review', 'payout_held')),
    paid: sum(by('paid')),
    openCount: by('open', 'in_review').length,
    paidCount: by('paid').length,
    heldCount: by('payout_held').length,
  };
}

export function toRepositorySummary(repo: MockRepository, bounties: MockBounty[]): RepositorySummary {
  const own = bounties.filter((b) => b.repo === repo.name);
  const latest = own.flatMap((b) => b.events.map((e) => e.at)).sort().at(-1) ?? null;
  return {
    ...repositoryRef(repo.name),
    description: repo.description,
    isPrivate: repo.isPrivate,
    stats: statsOf(own),
    lastActivityAt: latest,
  };
}

export function toSubmission(s: MockSubmission): Submission {
  const { checkResolvesAt: _resolvesAt, checkOutcome: _outcome, ...submission } = s;
  return submission;
}

export function toSummary(b: MockBounty): BountySummary {
  const repository = repositoryRef(b.repo);
  return {
    id: b.id,
    title: b.title,
    repository,
    issue: { number: b.issueNumber, url: `${repository.url}/issues/${b.issueNumber}` },
    status: statusOf(b),
    reward: rewardOf(b),
    labels: b.labels,
    submissionCount: b.submissions.length,
    createdAt: b.createdAt,
    updatedAt: b.updatedAt,
  };
}

export function toBounty(b: MockBounty): Bounty {
  return {
    ...toSummary(b),
    body: b.body,
    createdBy: { login: b.createdBy, avatarUrl: null },
    submissions: [...b.submissions].sort((x, y) => y.openedAt.localeCompare(x.openedAt)).map(toSubmission),
    events: [...b.events].sort((x, y) => x.at.localeCompare(y.at)),
    payout: b.payout,
  };
}
