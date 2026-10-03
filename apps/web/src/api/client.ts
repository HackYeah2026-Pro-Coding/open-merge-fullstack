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
  getSession(): Promise<Session>;
  /** Starts GitHub sign-in. The HTTP client leaves the page; `next` is where to land afterwards. */
  signIn(next: string): Promise<void>;
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
