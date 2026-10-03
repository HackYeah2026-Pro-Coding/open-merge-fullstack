import type { TokenAmount } from './money';
import type { GithubActor } from './user';

/**
 * open        reward locked, no pull request under review
 * in_review   at least one open pull request references the issue
 * payout_held merged, but the payout waits for a decision or a linked wallet
 * paid        reward released to the developer
 * closed      issue closed without a merge, reward returned
 */
export type BountyStatus = 'open' | 'in_review' | 'payout_held' | 'paid' | 'closed';

export type BountySort = 'newest' | 'reward';

export interface BountyListQuery {
  status?: BountyStatus;
  /** Free-text match on title and issue number. */
  q?: string;
  sort?: BountySort;
}

export type ReviewVerdict = 'approve' | 'changes' | 'pending';

export interface ReviewerVerdict {
  reviewer: string;
  verdict: ReviewVerdict;
  summary: string | null;
}

export type CheckState = 'not_run' | 'pending' | 'passed' | 'failed';

/** Result of the automated check on one commit. */
export interface CommitCheck {
  state: CheckState;
  reviewers: ReviewerVerdict[];
}

export type PullRequestState = 'open' | 'merged' | 'closed';

export interface Submission {
  id: string;
  prNumber: number;
  title: string;
  url: string;
  author: GithubActor;
  state: PullRequestState;
  headSha: string;
  check: CommitCheck;
  openedAt: string;
  updatedAt: string;
}

export type BountyEventType =
  | 'funded'
  | 'pr_opened'
  | 'merged'
  | 'paid'
  | 'payout_held'
  | 'refunded';

export interface BountyEvent {
  type: BountyEventType;
  at: string;
  actor: GithubActor | null;
  prNumber: number | null;
  commitSha: string | null;
  /** Set when the event moved funds. */
  txSignature: string | null;
  note: string | null;
}

export interface Payout {
  recipient: GithubActor;
  state: 'held' | 'released';
  wallet: string | null;
  txSignature: string | null;
  /** Why a held payout is waiting. */
  reason: string | null;
}

export interface BountyIssue {
  number: number;
  url: string;
}

export interface BountySummary {
  id: string;
  title: string;
  issue: BountyIssue;
  status: BountyStatus;
  reward: TokenAmount;
  labels: string[];
  submissionCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface Bounty extends BountySummary {
  /** Issue body, Markdown. */
  body: string;
  createdBy: GithubActor;
  submissions: Submission[];
  events: BountyEvent[];
  payout: Payout | null;
}

export interface CreateBountyInput {
  title: string;
  body: string;
  /** Integer base units of the reward token. */
  rewardAmount: string;
  labels: string[];
}

export interface ActivityItem {
  bounty: Pick<BountySummary, 'id' | 'title' | 'issue' | 'reward'>;
  event: BountyEvent;
}

/** A pull request the signed-in developer opened against a bounty. */
export interface MySubmission {
  bounty: BountySummary;
  submission: Submission;
  payout: Payout | null;
}
