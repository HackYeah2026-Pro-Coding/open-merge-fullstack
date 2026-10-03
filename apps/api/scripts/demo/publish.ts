import type { GithubApi } from './github-api';
import type { Log } from './log';
import { getRepo, repoPath, setRef, shortSha, type RepoInfo } from './repo-api';
import type { Scenario } from './scenario';
import { stageFiles, type RepoFile, type Stage } from './stages';

export interface PublishDeps {
  admin: GithubApi;
  /** Writes the fix commits, so GitHub shows the developer as their author. The admin does it when absent. */
  dev: GithubApi | null;
  org: string;
  scenario: Scenario;
  /** Files of a stage; the demo/repo folders unless a test says otherwise. */
  filesOf?: (stage: Stage) => RepoFile[];
  log: Log;
}

export interface PublishResult {
  baseline: string;
  v1: string;
  v2: string;
}

interface Commit {
  sha: string;
  tree: string;
}

/** Writes files as one commit through the git data API, so no local checkout is needed. */
async function commitFiles(
  api: GithubApi,
  base: string,
  files: RepoFile[],
  message: string,
  parent: Commit | null,
): Promise<Commit> {
  const entries: { path: string; mode: string; type: string; sha: string }[] = [];
  for (const file of files) {
    const blob = await api.request<{ sha: string }>('POST', `${base}/git/blobs`, { content: file.content, encoding: 'utf-8' });
    entries.push({ path: file.path, mode: '100644', type: 'blob', sha: blob.sha });
  }
  // The baseline has no base tree, so whatever the repository held before is dropped; the fixes only layer their files on top.
  const tree = await api.request<{ sha: string }>('POST', `${base}/git/trees`, { base_tree: parent?.tree, tree: entries });
  const commit = await api.request<{ sha: string }>('POST', `${base}/git/commits`, {
    message,
    tree: tree.sha,
    parents: parent ? [parent.sha] : [],
  });
  return { sha: commit.sha, tree: tree.sha };
}

/** Makes sure the developer can push to the repo; an outside account has to accept an invitation first. */
async function ensureDeveloperAccess(deps: PublishDeps, base: string): Promise<void> {
  if (!deps.dev) return;
  const { admin, dev, org, scenario, log } = deps;
  const developer = await dev.request<{ login: string }>('GET', '/user');
  const invitation = await admin.request<{ html_url?: string } | undefined>(
    'PUT',
    `${base}/collaborators/${encodeURIComponent(developer.login)}`,
    { permission: 'push' },
  );
  if (invitation?.html_url) {
    log(`Invited @${developer.login}. Accept at https://github.com/${org}/${scenario.repo.name}/invitations while signed in as them.`);
  } else {
    log(`@${developer.login} can push to the repository.`);
  }
}

/**
 * Creates the demo repository if needed and writes the three states of the code into it:
 * main is set to the baseline, and tags pin the baseline and both fixes so a reset can always return to them.
 */
export async function publish(deps: PublishDeps): Promise<PublishResult> {
  const { admin, dev, org, scenario, log } = deps;
  const filesOf = deps.filesOf ?? ((stage: Stage) => stageFiles(stage));
  const name = scenario.repo.name;
  const base = repoPath(org, name);

  let repo = await getRepo(admin, org, name);
  if (repo) {
    log(`Using the existing ${org}/${name}`);
  } else {
    log(`Creating ${org}/${name}`);
    // auto_init gives the repository a first commit, which the git data API needs to write into it.
    repo = await admin.request<RepoInfo>('POST', `/orgs/${encodeURIComponent(org)}/repos`, {
      name,
      description: scenario.repo.description,
      private: scenario.repo.private,
      auto_init: true,
    });
  }

  const author = dev ?? admin;
  const baseline = await commitFiles(admin, base, filesOf('base'), scenario.commits.baseline, null);
  const v1 = await commitFiles(author, base, filesOf('v1'), scenario.commits.v1, baseline);
  const v2 = await commitFiles(author, base, filesOf('v2'), scenario.commits.v2, v1);

  await setRef(admin, base, `tags/${scenario.refs.baseline}`, baseline.sha, true);
  await setRef(admin, base, `tags/${scenario.refs.v1}`, v1.sha, true);
  await setRef(admin, base, `tags/${scenario.refs.v2}`, v2.sha, true);
  await setRef(admin, base, `heads/${repo.default_branch}`, baseline.sha, true);
  log(`${repo.default_branch} is at the baseline ${shortSha(baseline.sha)}; tags ${scenario.refs.v1} ${shortSha(v1.sha)}, ${scenario.refs.v2} ${shortSha(v2.sha)}`);

  await ensureDeveloperAccess(deps, base);
  return { baseline: baseline.sha, v1: v1.sha, v2: v2.sha };
}
