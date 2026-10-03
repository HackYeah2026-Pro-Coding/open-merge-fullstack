import type { User } from '@escrow/shared';

/** A GithubAccount row loaded with `include: { wallet: true }`. */
export interface AccountWithWallet {
  id: string;
  githubLogin: string;
  name: string | null;
  avatarUrl: string | null;
  wallet: { address: string; linkedAt: Date } | null;
}

/** The account as the web app sees it, shared by the session and the wallet endpoints. */
export function toUser(account: AccountWithWallet): User {
  return {
    id: account.id,
    githubLogin: account.githubLogin,
    name: account.name,
    avatarUrl: account.avatarUrl,
    role: 'developer',
    wallet: account.wallet
      ? { address: account.wallet.address, linkedAt: account.wallet.linkedAt.toISOString() }
      : null,
  };
}
