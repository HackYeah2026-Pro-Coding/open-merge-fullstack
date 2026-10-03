import { UsageError } from './errors';
import { isHttpStatus, type GithubApi } from './github-api';

/** The fields of GitHub's repository object the demo uses. */
export interface RepoInfo {
  full_name: string;
  html_url: string;
  description: string | null;
  private: boolean;
  default_branch: string;
}

export interface PullInfo {
  number: number;
  title: string;
  state: 'open' | 'closed';
  merged_at: string | null;
  html_url: string;
  head: { sha: string; ref: string };
}

export const repoPath = (org: string, name: string): string => `/repos/${encodeURIComponent(org)}/${encodeURIComponent(name)}`;

/** A git ref such as "heads/fix/x" with each segment encoded. */
const refPath = (ref: string): string => ref.split('/').map(encodeURIComponent).join('/');

/** The repository, or null when GitHub says it does not exist. Any other failure propagates. */
export async function getRepo(api: GithubApi, org: string, name: string): Promise<RepoInfo | null> {
  try {
    return await api.request<RepoInfo>('GET', repoPath(org, name));
  } catch (error) {
    if (isHttpStatus(error, 404)) return null;
    throw error;
  }
}

export async function requireRepo(api: GithubApi, org: string, name: string): Promise<RepoInfo> {
  const repo = await getRepo(api, org, name);
  if (!repo) throw new UsageError(`${org}/${name} does not exist on GitHub. Run: pnpm demo:publish --yes`);
  return repo;
}

/** The commit a ref ("heads/main", "tags/demo-baseline") points at, or null when the ref does not exist. */
export async function getRefSha(api: GithubApi, base: string, ref: string): Promise<string | null> {
  try {
    const found = await api.request<{ object: { sha: string } }>('GET', `${base}/git/ref/${refPath(ref)}`);
    return found.object.sha;
  } catch (error) {
    if (isHttpStatus(error, 404)) return null;
    throw error;
  }
}

export async function requireTagSha(api: GithubApi, base: string, tag: string): Promise<string> {
  const sha = await getRefSha(api, base, `tags/${tag}`);
  if (!sha) throw new UsageError(`The tag ${tag} is missing in the demo repository. Run: pnpm demo:publish --yes`);
  return sha;
}

/** Creates the ref, or moves it when it exists. `force` allows a move that is not a fast-forward. */
export async function setRef(api: GithubApi, base: string, ref: string, sha: string, force: boolean): Promise<void> {
  if ((await getRefSha(api, base, ref)) === null) {
    await api.request('POST', `${base}/git/refs`, { ref: `refs/${ref}`, sha });
  } else {
    await api.request('PATCH', `${base}/git/refs/${refPath(ref)}`, { sha, force });
  }
}

export async function deleteBranch(api: GithubApi, base: string, branch: string): Promise<void> {
  await api.request('DELETE', `${base}/git/refs/heads/${refPath(branch)}`);
}

/** The newest pull request from this branch, in any state. */
export async function findPullRequest(api: GithubApi, base: string, org: string, branch: string): Promise<PullInfo | null> {
  const pulls = await api.request<PullInfo[]>('GET', `${base}/pulls?head=${encodeURIComponent(`${org}:${branch}`)}&state=all`);
  return pulls[0] ?? null;
}

export const shortSha = (sha: string): string => sha.slice(0, 7);
