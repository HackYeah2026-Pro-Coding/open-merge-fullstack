import type { RepositorySummary } from '@escrow/shared';

/** Repositories shown as chips before the rest move into the picker. */
export const MAX_VISIBLE_REPOS = 6;

export interface RepoSplit {
  visible: RepositorySummary[];
  overflow: RepositorySummary[];
}

/**
 * Splits repositories into chips and the picker's list. A selected repository that would land in
 * the picker takes the last chip's place, so the active filter is always on screen.
 */
export function splitRepos(repos: RepositorySummary[], selected: string | undefined, max = MAX_VISIBLE_REPOS): RepoSplit {
  if (repos.length <= max) return { visible: repos, overflow: [] };

  const visible = repos.slice(0, max - 1);
  const overflow = repos.slice(max - 1);
  const index = overflow.findIndex((repo) => repo.name === selected);
  if (index === -1) return { visible, overflow };

  const [promoted] = overflow.splice(index, 1);
  const [displaced] = visible.splice(visible.length - 1, 1, promoted!);
  return { visible, overflow: [displaced!, ...overflow] };
}

/** Case-insensitive match on name and description, the same rule the dashboard's repository list uses. */
export function matchRepos(repos: RepositorySummary[], query: string): RepositorySummary[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return repos;
  return repos.filter((r) => r.name.toLowerCase().includes(needle) || r.description?.toLowerCase().includes(needle));
}

/** False for a repository that has never had a bounty. */
export function hasBounties({ stats }: RepositorySummary): boolean {
  return stats.openCount + stats.paidCount + stats.heldCount > 0 || BigInt(stats.locked.amount) > 0n;
}
