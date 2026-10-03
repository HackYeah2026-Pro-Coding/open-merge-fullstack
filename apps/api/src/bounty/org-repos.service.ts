import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { GithubRepository, RepositorySummary } from '@escrow/shared';
import { ownerActor } from '../auth/to-user';
import type { Env } from '../config/env';
import { Prisma } from '../generated/prisma/client';
import { GithubService } from '../github/github.service';
import { PrismaService } from '../prisma/prisma.service';
import { orgRepos } from './bounty-query';
import { toRepositorySummary } from './bounty-view';

/** The fields of GitHub's organization repository listing this service uses. */
interface GithubOrgRepo {
  name: string;
  full_name: string;
  html_url: string;
  description: string | null;
  private: boolean;
  archived: boolean;
  pushed_at: string | null;
}

/** Adds repositories of the organization from GitHub, so they show on the dashboard and can carry bounties. */
@Injectable()
export class OrgReposService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly github: GithubService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  /** Every repository of the organization the token can see, most recently pushed first. */
  async onGithub(): Promise<GithubRepository[]> {
    const org = this.org();
    const [repos, stored] = await Promise.all([
      this.github.requestAll<GithubOrgRepo>(`/orgs/${encodeURIComponent(org)}/repos?type=all&sort=pushed`),
      this.prisma.githubRepo.findMany({ where: orgRepos(org), select: { githubRepoName: true } }),
    ]);
    const added = new Set(stored.map((repo) => repo.githubRepoName.toLowerCase()));
    return repos.map((repo) => ({
      name: repo.name,
      fullName: repo.full_name,
      url: repo.html_url,
      description: repo.description,
      isPrivate: repo.private,
      archived: repo.archived,
      pushedAt: repo.pushed_at,
      added: added.has(repo.full_name.toLowerCase()),
    }));
  }

  /** Looks the repository up in the organization on GitHub and stores it under its canonical name. */
  async add(name: string): Promise<RepositorySummary> {
    const org = this.org();
    const info = await this.github.getRepo({ owner: org, repo: name });
    // GitHub follows a transferred repository to its new owner, which is outside the organization.
    if (!info.fullName.toLowerCase().startsWith(`${org.toLowerCase()}/`)) {
      throw new NotFoundException(`Repository ${name} is not part of ${org}.`);
    }
    if (info.archived) {
      throw new BadRequestException(`${info.fullName} is archived on GitHub, so it cannot take new issues.`);
    }

    try {
      const repo = await this.prisma.githubRepo.create({
        data: {
          githubRepoName: info.fullName,
          githubRepoUrl: info.htmlUrl,
          description: info.description,
          isPrivate: info.isPrivate,
        },
      });
      return toRepositorySummary(repo, [], ownerActor(this.config.get('GITHUB_OWNER_LOGIN', { infer: true })));
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException(`${info.fullName} is already added.`);
      }
      throw error;
    }
  }

  private org(): string {
    return this.config.get('GITHUB_ORG', { infer: true });
  }
}
