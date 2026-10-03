import { Injectable } from '@nestjs/common';
import { GithubService } from '../github/github.service';
import { MAX_TARBALL_BYTES } from './tools/repo-snapshot';

/** Marks the bot comment so later runs update it instead of adding another. */
export const COMMENT_MARKER = '<!-- openmerge-review -->';
/** Name of the commit status shown next to the CI checks. */
export const STATUS_CONTEXT = 'OpenMerge / AI review';

export interface RepoSlug {
  owner: string;
  repo: string;
}

export interface PullFile {
  filename: string;
  status: 'added' | 'removed' | 'modified' | 'renamed' | 'copied' | 'changed' | 'unchanged';
  /** Missing for binary files and for diffs GitHub considers too large. */
  patch?: string;
  changes: number;
}

export interface WorkflowRun {
  id: number;
  name: string | null;
  status: string;
  conclusion: string | null;
}

interface ClosingIssuesResponse {
  repository: {
    pullRequest: { closingIssuesReferences: { nodes: { number: number; repository: { nameWithOwner: string } }[] } };
  };
}

const CLOSING_ISSUES = `query ClosingIssues($owner: String!, $repo: String!, $number: Int!) {
  repository(owner: $owner, name: $repo) {
    pullRequest(number: $number) {
      closingIssuesReferences(first: 10) { nodes { number repository { nameWithOwner } } }
    }
  }
}`;

const base = ({ owner, repo }: RepoSlug) => `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;

/** The GitHub calls the review needs, on top of the shared authenticated client. */
@Injectable()
export class GithubReviewClient {
  constructor(private readonly github: GithubService) {}

  /** Issue numbers (in the pull request's own repository) that the pull request closes. */
  async closingIssueNumbers(slug: RepoSlug, number: number): Promise<number[]> {
    const data = await this.github.graphql<ClosingIssuesResponse>(CLOSING_ISSUES, { ...slug, number });
    const fullName = `${slug.owner}/${slug.repo}`.toLowerCase();
    return data.repository.pullRequest.closingIssuesReferences.nodes
      .filter((n) => n.repository.nameWithOwner.toLowerCase() === fullName)
      .map((n) => n.number);
  }

  listFiles(slug: RepoSlug, number: number): Promise<PullFile[]> {
    return this.github.requestAll<PullFile>(`${base(slug)}/pulls/${number}/files`);
  }

  /** Text of a file at one commit. Rejects when it is not a regular file. */
  async fileContent(slug: RepoSlug, path: string, ref: string): Promise<string> {
    const encoded = path.split('/').map(encodeURIComponent).join('/');
    const file = await this.github.request<{ type: string; encoding: string; content: string }>(
      'GET',
      `${base(slug)}/contents/${encoded}?ref=${encodeURIComponent(ref)}`,
    );
    if (file.type !== 'file' || file.encoding !== 'base64') {
      throw new Error(`${path} is not a regular file at ${ref}`);
    }
    return Buffer.from(file.content, 'base64').toString('utf8');
  }

  async workflowRuns(slug: RepoSlug, headSha: string): Promise<WorkflowRun[]> {
    const data = await this.github.request<{ workflow_runs: WorkflowRun[] }>(
      'GET',
      `${base(slug)}/actions/runs?head_sha=${encodeURIComponent(headSha)}&per_page=100`,
    );
    return data.workflow_runs;
  }

  /** Names of the jobs of one run that did not succeed. */
  async failedJobNames(slug: RepoSlug, runId: number): Promise<string[]> {
    const data = await this.github.request<{ jobs: { name: string; conclusion: string | null }[] }>(
      'GET',
      `${base(slug)}/actions/runs/${runId}/jobs?filter=latest&per_page=100`,
    );
    return data.jobs.filter((j) => j.conclusion === 'failure' || j.conclusion === 'timed_out').map((j) => j.name);
  }

  async setStatus(
    slug: RepoSlug,
    sha: string,
    status: { state: 'pending' | 'success' | 'failure' | 'error'; description: string; targetUrl?: string },
  ): Promise<void> {
    await this.github.request('POST', `${base(slug)}/statuses/${encodeURIComponent(sha)}`, {
      state: status.state,
      context: STATUS_CONTEXT,
      // GitHub rejects descriptions above 140 characters.
      description: status.description.slice(0, 140),
      target_url: status.targetUrl,
    });
  }

  /** Creates the review comment, or edits the one a previous run left. */
  async upsertComment(slug: RepoSlug, number: number, body: string): Promise<void> {
    const comments = await this.github.requestAll<{ id: number; body: string }>(
      `${base(slug)}/issues/${number}/comments`,
    );
    const existing = comments.find((c) => c.body.includes(COMMENT_MARKER));
    if (existing) {
      await this.github.request('PATCH', `${base(slug)}/issues/comments/${existing.id}`, { body });
    } else {
      await this.github.request('POST', `${base(slug)}/issues/${number}/comments`, { body });
    }
  }

  /** The repository at one commit as a gzipped tarball, for the reviewers' read-only tools. */
  tarball(slug: RepoSlug, ref: string): Promise<Buffer> {
    return this.github.download(`${base(slug)}/tarball/${encodeURIComponent(ref)}`, MAX_TARBALL_BYTES);
  }

  /** The pull request as it is now: its text for the prompt, and its head to detect a newer push. */
  async getPullRequest(slug: RepoSlug, number: number): Promise<{ title: string; body: string; headSha: string }> {
    const pr = await this.github.request<{ title: string; body: string | null; head: { sha: string } }>(
      'GET',
      `${base(slug)}/pulls/${number}`,
    );
    return { title: pr.title, body: pr.body ?? '', headSha: pr.head.sha };
  }
}
