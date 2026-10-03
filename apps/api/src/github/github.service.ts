import {
  BadGatewayException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env';
import type { GithubRepoRef } from './github-repo-url';

const GITHUB_API = 'https://api.github.com';

/** The fields of GitHub's repository object this app uses. */
export interface GithubRepoInfo {
  /** "owner/name" in GitHub's canonical casing. */
  fullName: string;
  htmlUrl: string;
  description: string | null;
  isPrivate: boolean;
}

/** The fields of GitHub's issue object this app uses. */
export interface GithubIssueInfo {
  number: number;
  htmlUrl: string;
}

/** Thin client for the GitHub REST API. */
@Injectable()
export class GithubService {
  constructor(private readonly config: ConfigService<Env, true>) {}

  async getRepo({ owner, repo }: GithubRepoRef): Promise<GithubRepoInfo> {
    const slug = `${owner}/${repo}`;
    const res = await fetch(`${GITHUB_API}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`, {
      headers: this.headers(),
    });

    if (res.status === 404) {
      throw new NotFoundException(`Repository ${slug} was not found on GitHub`);
    }
    if (!res.ok) {
      const body = await res.text();
      throw new BadGatewayException(`GitHub returned ${res.status} for ${slug}: ${body.slice(0, 200)}`);
    }

    const data = (await res.json()) as {
      full_name: string;
      html_url: string;
      description: string | null;
      private: boolean;
    };
    return {
      fullName: data.full_name,
      htmlUrl: data.html_url,
      description: data.description,
      isPrivate: data.private,
    };
  }

  /**
   * Throws unless a token is configured. Opening issues needs one, so callers check
   * this before doing work that would be left half done without it.
   */
  assertCanCreateIssues(): void {
    if (!this.config.get('GITHUB_TOKEN', { infer: true })) {
      throw new ServiceUnavailableException('GITHUB_TOKEN is not set, so issues cannot be opened on GitHub');
    }
  }

  async createIssue(
    { owner, repo }: GithubRepoRef,
    issue: { title: string; body: string; labels?: string[] },
  ): Promise<GithubIssueInfo> {
    this.assertCanCreateIssues();
    const slug = `${owner}/${repo}`;
    const res = await fetch(
      `${GITHUB_API}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues`,
      {
        method: 'POST',
        headers: { ...this.headers(), 'Content-Type': 'application/json' },
        body: JSON.stringify(issue),
      },
    );

    if (!res.ok) {
      const body = await res.text();
      throw new BadGatewayException(
        `GitHub returned ${res.status} when opening an issue in ${slug}: ${body.slice(0, 200)}`,
      );
    }

    const data = (await res.json()) as { number: number; html_url: string };
    return { number: data.number, htmlUrl: data.html_url };
  }

  /**
   * Authenticated REST call. Any non-2xx answer becomes a 502 carrying GitHub's
   * status and message; a 204 resolves to undefined.
   */
  async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    this.assertHasToken();
    const res = await fetch(`${GITHUB_API}${path}`, {
      method,
      headers: { ...this.headers(), 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new BadGatewayException(`GitHub returned ${res.status} for ${method} ${path}: ${text.slice(0, 200)}`);
    }
    return (res.status === 204 ? undefined : await res.json()) as T;
  }

  /** Fetches every page of a REST list endpoint, 100 items at a time. */
  async requestAll<T>(path: string): Promise<T[]> {
    const items: T[] = [];
    const separator = path.includes('?') ? '&' : '?';
    for (let page = 1; ; page++) {
      const batch = await this.request<T[]>('GET', `${path}${separator}per_page=100&page=${page}`);
      items.push(...batch);
      if (batch.length < 100) return items;
    }
  }

  /** GraphQL call. GitHub reports GraphQL failures with a 200 and an `errors` list. */
  async graphql<T>(query: string, variables: Record<string, unknown>): Promise<T> {
    const result = await this.request<{ data?: T; errors?: { message: string }[] }>('POST', '/graphql', {
      query,
      variables,
    });
    if (result.errors?.length) {
      throw new BadGatewayException(`GitHub GraphQL error: ${result.errors.map((e) => e.message).join('; ')}`);
    }
    return result.data as T;
  }

  private assertHasToken(): void {
    if (!this.config.get('GITHUB_TOKEN', { infer: true })) {
      throw new ServiceUnavailableException('GITHUB_TOKEN is not set, so this GitHub action cannot run');
    }
  }

  private headers(): Record<string, string> {
    const headers: Record<string, string> = {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'OpenMerge',
    };
    const token = this.config.get('GITHUB_TOKEN', { infer: true });
    if (token) headers.Authorization = `Bearer ${token}`;
    return headers;
  }
}
