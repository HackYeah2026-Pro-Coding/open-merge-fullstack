import type { GithubActor, User, UserRole } from '@escrow/shared';

/** A GithubAccount row loaded with `include: { wallet: true }`. */
export interface AccountWithWallet {
  id: string;
  githubLogin: string;
  name: string | null;
  avatarUrl: string | null;
  wallet: { address: string; linkedAt: Date } | null;
}

/** The account as the web app sees it, shared by the session and the wallet endpoints. */
export function toUser(account: AccountWithWallet, role: UserRole = 'developer'): User {
  return {
    id: account.id,
    githubLogin: account.githubLogin,
    name: account.name,
    avatarUrl: account.avatarUrl,
    role,
    wallet: account.wallet
      ? { address: account.wallet.address, linkedAt: account.wallet.linkedAt.toISOString() }
      : null,
  };
}

/** The organization owner as it appears on bounties; GitHub serves every account's avatar at this URL. */
export function ownerActor(login: string): GithubActor {
  return { login, avatarUrl: `https://github.com/${login}.png` };
}

/**
 * The owner while the owner view is open. Uses their account when they have signed
 * in before, so the name and avatar match GitHub; the owner is never paid, so no wallet.
 */
export function toOwnerUser(login: string, account: AccountWithWallet | null): User {
  if (account) return { ...toUser(account, 'maintainer'), wallet: null };
  const { avatarUrl } = ownerActor(login);
  return { id: `owner:${login}`, githubLogin: login, name: null, avatarUrl, role: 'maintainer', wallet: null };
}
