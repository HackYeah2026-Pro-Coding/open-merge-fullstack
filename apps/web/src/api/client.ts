import type {
  ActivityItem,
  Bounty,
  BountyListQuery,
  BountySummary,
  CreateBountyInput,
  LinkWalletInput,
  MySubmission,
  Project,
  ProjectStats,
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
  /** The project owner while the owner view is open, otherwise the signed-in developer (or nobody). */
  getSession(): Promise<Session>;
  /** Starts GitHub sign-in for a developer. The HTTP client leaves the page; `next` is where to land afterwards. */
  signIn(next: string): Promise<void>;
  /**
   * Opens the project owner view. There is a single owner per project, so this
   * takes no credentials; the developer session underneath is kept as it was.
   */
  openOwnerView(): Promise<void>;
  /** Leaves the owner view when it is open (back to the developer session), otherwise signs the developer out. */
  signOut(): Promise<void>;

  getProject(): Promise<Project>;
  getStats(): Promise<ProjectStats>;
  listActivity(): Promise<ActivityItem[]>;

  listBounties(query: BountyListQuery): Promise<BountySummary[]>;
  getBounty(issueNumber: number): Promise<Bounty>;
  createBounty(input: CreateBountyInput): Promise<Bounty>;

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
