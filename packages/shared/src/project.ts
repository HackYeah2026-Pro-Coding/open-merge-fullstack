import type { TokenAmount } from './money';
import type { GithubActor } from './user';

/** The GitHub organization OpenMerge serves. Every repository in it can carry bounties. */
export interface Organization {
  login: string;
  name: string | null;
  url: string;
  avatarUrl: string | null;
  /** The single account that posts and merges bounties for the organization. */
  owner: GithubActor;
}

/** Enough to name and link a repository of the organization. */
export interface RepositoryRef {
  /** Repository name within the organization, e.g. "taskq". */
  name: string;
  /** owner/name, e.g. "acme/taskq". */
  fullName: string;
  url: string;
}

export interface BountyStats {
  locked: TokenAmount;
  paid: TokenAmount;
  /** Open and in review. */
  openCount: number;
  paidCount: number;
  heldCount: number;
}

export interface OrganizationStats extends BountyStats {
  repositoryCount: number;
  contributorCount: number;
}

export interface RepositorySummary extends RepositoryRef {
  description: string | null;
  isPrivate: boolean;
  stats: BountyStats;
  /** Latest bounty event in the repository, null when it has none. */
  lastActivityAt: string | null;
}
