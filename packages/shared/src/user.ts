export type UserRole = 'maintainer' | 'developer';

/** A GitHub account as it appears on issues, pull requests and events. */
export interface GithubActor {
  login: string;
  avatarUrl: string | null;
}

export interface LinkedWallet {
  /** Base58 Solana public key. */
  address: string;
  linkedAt: string;
}

export interface User {
  id: string;
  githubLogin: string;
  name: string | null;
  avatarUrl: string | null;
  role: UserRole;
  wallet: LinkedWallet | null;
}

export interface Session {
  user: User | null;
}

/** Why GitHub sign-in sent the browser back to /sign-in, as the `error` query parameter. */
export type SignInError = 'access_denied' | 'state_mismatch' | 'github';

/** Message the user signs with their wallet to prove they own the address. */
export interface WalletChallenge {
  nonce: string;
  message: string;
  expiresAt: string;
}

export interface LinkWalletInput {
  address: string;
  nonce: string;
  /** Base64 ed25519 signature of the challenge message. */
  signature: string;
}
