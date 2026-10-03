import type {
  ActivityItem,
  Bounty,
  BountyListQuery,
  BountySummary,
  CreateBountyInput,
  GithubRepository,
  LinkWalletInput,
  MySubmission,
  Organization,
  OrganizationStats,
  RepositorySummary,
  Session,
  User,
  WalletChallenge,
} from '@escrow/shared';

/**
 * Everything the web app needs from the backend. Two implementations exist:
 * `http` talks to the NestJS API, `mock` runs in the browser so the whole
 * product is usable before the endpoints land.
 */
export interface ApiClient {
  /** The owner while the owner view is open, otherwise the signed-in developer (or nobody). */
  getSession(): Promise<Session>;
  /** Starts GitHub sign-in for a developer. The HTTP client leaves the page; `next` is where to land afterwards. */
  signIn(next: string): Promise<void>;
  /**
   * Opens the owner view. There is a single owner per organization, so this
   * takes no credentials; the developer session underneath is kept as it was.
   */
  openOwnerView(): Promise<void>;
  /** Leaves the owner view when it is open (back to the developer session), otherwise signs the developer out. */
  signOut(): Promise<void>;

  getOrganization(): Promise<Organization>;
  getStats(): Promise<OrganizationStats>;
  /** Latest events across the organization, or in one repository. */
  listActivity(repo?: string): Promise<ActivityItem[]>;
  /** Every repository of the organization, most recently active first. */
  listRepositories(): Promise<RepositorySummary[]>;
  getRepository(name: string): Promise<RepositorySummary>;
  /** Repositories of the organization on GitHub, marked when already added. Owner only. */
  listGithubRepositories(): Promise<GithubRepository[]>;
  /** Adds a repository of the organization, so it shows on the dashboard and can carry bounties. Owner only. */
  addRepository(name: string): Promise<RepositorySummary>;

  listBounties(query: BountyListQuery): Promise<BountySummary[]>;
  getBounty(repo: string, issueNumber: number): Promise<Bounty>;
  createBounty(input: CreateBountyInput): Promise<Bounty>;

  /** Runs an AI review again after it ended in an error. The result arrives through the bounty's submissions. */
  rerunReview(reviewId: string): Promise<void>;

  listMySubmissions(): Promise<MySubmission[]>;
  createWalletChallenge(address: string): Promise<WalletChallenge>;
  linkWallet(input: LinkWalletInput): Promise<User>;
  unlinkWallet(): Promise<User>;
}

/** An error response from the API, shaped by the API's HttpExceptionFilter. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}
