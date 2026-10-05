import { UsageError } from './errors';
import { isHttpStatus, type GithubApi } from './github-api';
import type { Log } from './log';
import { commitFiles, type Commit } from './publish';
import { getRepo, repoPath, setRef, type RepoInfo } from './repo-api';
import type { RepoFile } from './stages';

export interface RecreateArgs {
  /** Needs the delete_repo scope (classic) or Administration: write (fine-grained). */
  admin: GithubApi;
  org: string;
  name: string;
  description: string;
  private: boolean;
  /** The whole repository at its baseline. */
  files: RepoFile[];
  message: string;
  sleep: (ms: number) => Promise<void>;
  log: Log;
}

/** GitHub frees a deleted repository's name after a moment, so creating it again is retried briefly. */
const CREATE_ATTEMPTS = 10;
const CREATE_RETRY_MS = 3_000;

async function createRepo(args: RecreateArgs): Promise<RepoInfo> {
  for (let attempt = 1; ; attempt++) {
    try {
      // auto_init gives the repository a first commit, which the git data API needs to write into it.
      return await args.admin.request<RepoInfo>('POST', `/orgs/${encodeURIComponent(args.org)}/repos`, {
        name: args.name,
        description: args.description,
        private: args.private,
        auto_init: true,
      });
    } catch (error) {
      // 422 "name already exists" right after a delete; anything else is a real failure.
      if (!isHttpStatus(error, 422) || attempt === CREATE_ATTEMPTS) throw error;
      await args.sleep(CREATE_RETRY_MS);
    }
  }
}

/**
 * Deletes the repository when it exists and creates it again holding only the baseline, so a take
 * starts from a repo with no issues or pull requests, whose first issue is #1.
 */
export async function recreateRepo(args: RecreateArgs): Promise<{ repo: RepoInfo; baseline: Commit }> {
  const { admin, org, name, log } = args;
  const base = repoPath(org, name);

  if (await getRepo(admin, org, name)) {
    log(`Deleting ${org}/${name}`);
    try {
      await admin.request('DELETE', base);
    } catch (error) {
      if (isHttpStatus(error, 403)) {
        throw new UsageError('DEMO_ADMIN_TOKEN may not delete repositories: add the delete_repo scope to the token.', { cause: error });
      }
      throw error;
    }
  }

  log(`Creating ${org}/${name}`);
  const repo = await createRepo(args);
  const baseline = await commitFiles(admin, base, args.files, args.message, null);
  await setRef(admin, base, `heads/${repo.default_branch}`, baseline.sha, true);
  return { repo, baseline };
}

/** The developer's branch: one commit with the fix on top of the baseline. */
export async function pushFixBranch(
  dev: GithubApi,
  org: string,
  name: string,
  branch: string,
  baseline: Commit,
  files: RepoFile[],
  message: string,
): Promise<Commit> {
  const base = repoPath(org, name);
  const fix = await commitFiles(dev, base, files, message, baseline);
  await setRef(dev, base, `heads/${branch}`, fix.sha, false);
  return fix;
}

/**
 * The API reaches GitHub with GITHUB_TOKEN: to list the repo in "Add repository" and to open the bounty's
 * issue. A fine-grained token limited to selected repositories never includes a repo created after it.
 */
export async function requireBotAccess(bot: GithubApi, org: string, name: string): Promise<void> {
  if (!(await getRepo(bot, org, name))) {
    throw new UsageError(
      `GITHUB_TOKEN cannot see ${org}/${name}. Give the token access to all repositories of the organization: ` +
        'a re-created repo is a new repo, so a token limited to selected ones loses it on every take.',
    );
  }
}
