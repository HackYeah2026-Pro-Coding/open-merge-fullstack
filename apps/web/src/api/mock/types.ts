import type { BountyEvent, CheckState, Payout, ReviewerVerdict, Submission, User } from '@escrow/shared';

export const MOCK_TOKEN = { symbol: 'USDC', decimals: 6 } as const;

export interface MockSubmission extends Submission {
  /** A pending check settles to `checkOutcome` once this time passes. */
  checkResolvesAt: string | null;
  checkOutcome: { state: CheckState; reviewers: ReviewerVerdict[] } | null;
}

export interface MockBounty {
  id: string;
  issueNumber: number;
  title: string;
  body: string;
  rewardAmount: string;
  labels: string[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
  submissions: MockSubmission[];
  events: BountyEvent[];
  payout: Payout | null;
}

export interface MockDb {
  version: 1;
  users: User[];
  bounties: MockBounty[];
  sessionUserId: string | null;
  /** Who "Continue with GitHub" signs in as. Switched from the mock panel. */
  signInAsUserId: string;
  nextIssueNumber: number;
  nextPrNumber: number;
}
