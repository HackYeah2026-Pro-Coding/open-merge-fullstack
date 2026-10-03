import type { Bounty, BountyStatus, BountySummary, Submission } from '@escrow/shared';
import { env } from '@/lib/env';
import { MOCK_TOKEN, type MockBounty, type MockSubmission } from './types';

/** Settles pending checks whose time has come. Returns true when something changed. */
export function settleChecks(bounty: MockBounty, now: Date = new Date()): boolean {
  let changed = false;
  for (const s of bounty.submissions) {
    if (s.checkResolvesAt && s.checkOutcome && new Date(s.checkResolvesAt) <= now) {
      s.check = s.checkOutcome;
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

export function toSubmission(s: MockSubmission): Submission {
  const { checkResolvesAt: _resolvesAt, checkOutcome: _outcome, ...submission } = s;
  return submission;
}

export function toSummary(b: MockBounty): BountySummary {
  return {
    id: b.id,
    title: b.title,
    issue: { number: b.issueNumber, url: `https://github.com/${env.githubRepo}/issues/${b.issueNumber}` },
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
