export interface GithubRepoRef {
  owner: string;
  repo: string;
}

const HOSTS = new Set(['github.com', 'www.github.com']);
const OWNER = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;
const REPO = /^[A-Za-z0-9._-]{1,100}$/;

/**
 * Extracts owner and repo from a GitHub repository URL. Accepts the forms people
 * paste: with or without scheme, trailing slash, `.git`, or a deeper path such as
 * `/issues`. Returns undefined when the input is not a GitHub repository URL.
 */
export function parseGithubRepoUrl(input: string): GithubRepoRef | undefined {
  const withScheme = /^[a-z]+:\/\//i.test(input) ? input : `https://${input}`;

  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    // Not parseable as a URL at all, which is exactly the "not a repo URL" answer.
    return undefined;
  }

  if (!['http:', 'https:'].includes(url.protocol) || !HOSTS.has(url.hostname.toLowerCase())) {
    return undefined;
  }

  const [owner, rawRepo] = url.pathname.split('/').filter(Boolean);
  const repo = rawRepo?.replace(/\.git$/i, '');
  if (!owner || !repo || !OWNER.test(owner) || !REPO.test(repo)) return undefined;

  return { owner, repo };
}
