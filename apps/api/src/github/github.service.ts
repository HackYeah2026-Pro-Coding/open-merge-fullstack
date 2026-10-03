import { BadGatewayException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env';
import type { GithubRepoRef } from './github-repo-url';

const GITHUB_API = 'https://api.github.com';

/** The fields of GitHub's repository object this app uses. */
export interface GithubRepoInfo {
  /** "owner/name" in GitHub's canonical casing. */
  fullName: string;
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

    const data = (await res.json()) as { full_name: string; html_url: string };
    return { fullName: data.full_name, htmlUrl: data.html_url };
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
