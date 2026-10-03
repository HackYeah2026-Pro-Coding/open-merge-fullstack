/**
 * What the add-repository search box holds: text to match against names, one exact
 * repository named by a link or "owner/name", or a repository outside the organization.
 */
export type RepoQuery =
  | { kind: 'match'; needle: string }
  | { kind: 'exact'; name: string }
  | { kind: 'outside'; fullName: string };

const GITHUB_URL = /^(?:https?:\/\/)?(?:www\.)?github\.com\/([^/?#]+)(?:\/([^/?#]+))?/i;
const SLUG = /^([A-Za-z0-9-]+)\/([A-Za-z0-9._-]+)$/;

/** Reads the search box. A GitHub link or "owner/name" points at one repository; anything else is matched. */
export function parseRepoQuery(input: string, org: string): RepoQuery {
  const text = input.trim();
  const [, owner, rawName] = GITHUB_URL.exec(text) ?? SLUG.exec(text) ?? [];
  if (!owner) return { kind: 'match', needle: text.toLowerCase() };

  const name = rawName?.replace(/\.git$/i, '');
  if (owner.toLowerCase() !== org.toLowerCase()) {
    return { kind: 'outside', fullName: name ? `${owner}/${name}` : owner };
  }
  // A link to the organization itself lists everything in it.
  return name ? { kind: 'exact', name } : { kind: 'match', needle: '' };
}

/** The repositories a query selects, names starting with the text first. */
export function filterRepos<T extends { name: string; description: string | null }>(repos: T[], query: RepoQuery): T[] {
  if (query.kind === 'outside') return [];
  if (query.kind === 'exact') return repos.filter((r) => r.name.toLowerCase() === query.name.toLowerCase());

  const { needle } = query;
  if (!needle) return repos;
  const matches = repos.filter(
    (r) => r.name.toLowerCase().includes(needle) || r.description?.toLowerCase().includes(needle),
  );
  const starts = (r: T) => (r.name.toLowerCase().startsWith(needle) ? 0 : 1);
  return matches.sort((a, b) => starts(a) - starts(b));
}
