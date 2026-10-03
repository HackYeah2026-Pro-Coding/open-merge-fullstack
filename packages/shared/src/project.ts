import type { TokenAmount } from './money';
import type { GithubActor } from './user';

/** The single repository bounties are posted on. */
export interface Project {
  owner: string;
  repo: string;
  url: string;
  maintainer: GithubActor;
}

export interface ProjectStats {
  locked: TokenAmount;
  paid: TokenAmount;
  openCount: number;
  paidCount: number;
  heldCount: number;
  contributorCount: number;
}
