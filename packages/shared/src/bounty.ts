import type { TokenAmount } from './money';
import type { RepositoryRef } from './project';
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
  /** Repository name within the organization. Omit for every repository. */
  repo?: string;
  status?: BountyStatus;
  /** Free-text match on title and issue number. */
  q?: string;
  sort?: BountySort;
}

/** `error` means the reviewer gave no answer (outage, refusal, unreadable reply). */
export type ReviewVerdict = 'approve' | 'changes' | 'pending' | 'error';

export type CriterionStatus = 'met' | 'not_met' | 'unknown';

/** One acceptance criterion derived from the issue, and what the reviewer found for it. */
export interface ReviewCriterion {
  criterion: string;
  status: CriterionStatus;
  /** file:line or a CI job name; says what is missing when the status is unknown. */
  evidence: string;
}

export type ReviewConfidence = 'low' | 'medium' | 'high';

/** Read-only tools a reviewer can use to look at the repository beyond the diff. */
export type ReviewToolName = 'read_file' | 'search' | 'list_dir';

/** One look a reviewer took at the repository, recorded by the server as it ran, not reported by the model. */
export interface ReviewSource {
  tool: ReviewToolName;
  /** The file read, the directory listed, or the text searched for. */
  target: string;
  /** False when the call failed, e.g. the file does not exist at the reviewed commit. */
  ok: boolean;
}

export interface ReviewerVerdict {
  reviewer: string;
  verdict: ReviewVerdict;
  /** One or two sentences for the project owner; the error message when the verdict is `error`. */
  summary: string | null;
  /** Model that answered, when it did. */
  model: string | null;
  confidence: ReviewConfidence | null;
  criteria: ReviewCriterion[];
  risks: string[];
  /** What the reviewer looked at in the repository, in order; empty when it used no tools. */
  sources: ReviewSource[];
}

export type CheckState = 'not_run' | 'pending' | 'passed' | 'failed' | 'error';

/** Result of the automated check on one commit. */
export interface CommitCheck {
  state: CheckState;
  reviewers: ReviewerVerdict[];
}

/**
 * passed   every workflow run of the commit succeeded
 * failed   at least one run failed
 * none     the repository ran no CI for this commit
 * timeout  CI was still running when the review started
 */
export type CiState = 'passed' | 'failed' | 'none' | 'timeout';

export interface CiResult {
  state: CiState;
  failedJobs: string[];
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
  /** CI outcome the review took into account; null until a review has run. */
  ci: CiResult | null;
  /** Review run to retry when its check state is `error`; null when there is nothing to retry. */
  retryableReviewId: string | null;
  reviewedAt: string | null;
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
  repository: RepositoryRef;
  /** Issue numbers are unique within a repository only. */
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
  /** Repository name within the organization. */
  repo: string;
  title: string;
  body: string;
  /** Integer base units of the reward token. */
  rewardAmount: string;
  labels: string[];
}

export interface ActivityItem {
  bounty: Pick<BountySummary, 'id' | 'title' | 'repository' | 'issue' | 'reward'>;
  event: BountyEvent;
}

/** A pull request the signed-in developer opened against a bounty. */
export interface MySubmission {
  bounty: BountySummary;
  submission: Submission;
  payout: Payout | null;
}
