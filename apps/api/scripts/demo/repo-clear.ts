import type { GithubApi } from './github-api';
import { deleteBranch, repoPath } from './repo-api';

const DELETE_ISSUE = `mutation DeleteIssue($id: ID!) {
  deleteIssue(input: { issueId: $id }) { clientMutationId }
}`;

export interface ClearResult {
  closedPullRequests: number[];
  deletedBranches: string[];
  deletedIssues: number[];
}

interface RestIssue {
  number: number;
  node_id: string;
  /** Present when the "issue" is really a pull request, which GitHub cannot delete. */
  pull_request?: unknown;
}

/**
 * Empties the demo repository on GitHub: closes open pull requests, deletes every branch but the
 * default one and deletes every issue. Pull requests cannot be deleted and stay as closed.
 * The admin token is needed: deleting an issue takes admin rights on the repository.
 */
export async function clearRepo(api: GithubApi, org: string, name: string, defaultBranch: string): Promise<ClearResult> {
  const base = repoPath(org, name);
  const result: ClearResult = { closedPullRequests: [], deletedBranches: [], deletedIssues: [] };

  // Pull requests first: deleting a branch under an open one closes it in a way that cannot be reopened.
  for (const pull of await api.requestAll<{ number: number }>(`${base}/pulls?state=open`)) {
    await api.request('PATCH', `${base}/pulls/${pull.number}`, { state: 'closed' });
    result.closedPullRequests.push(pull.number);
  }

  for (const branch of await api.requestAll<{ name: string }>(`${base}/branches`)) {
    if (branch.name === defaultBranch) continue;
    await deleteBranch(api, base, branch.name);
    result.deletedBranches.push(branch.name);
  }

  const issues = (await api.requestAll<RestIssue>(`${base}/issues?state=all`)).filter((issue) => !issue.pull_request);
  for (const issue of issues) {
    await api.graphql(DELETE_ISSUE, { id: issue.node_id });
    result.deletedIssues.push(issue.number);
  }
  return result;
}
