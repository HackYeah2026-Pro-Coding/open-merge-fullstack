import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ActivityItem, GithubActor, Organization, OrganizationStats, RepositorySummary } from '@escrow/shared';
import { ownerActor } from '../auth/to-user';
import type { Env } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';
import { bountyInclude, listedBounties, orgRepo, orgRepos } from './bounty-query';
import { eventsOf, rewardOf, statsOf, toRepositorySummary, toSummary } from './bounty-view';

/** How many events the activity feed shows. */
const ACTIVITY_LIMIT = 12;

/** The organization, its repositories and the numbers across them. */
@Injectable()
export class OrgService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  organization(): Organization {
    const login = this.org();
    return {
      login,
      name: null,
      url: `https://github.com/${login}`,
      avatarUrl: `https://github.com/${login}.png`,
      owner: this.owner(),
    };
  }

  async stats(): Promise<OrganizationStats> {
    const [bounties, repositoryCount] = await Promise.all([
      this.prisma.issue.findMany({ where: listedBounties(orgRepos(this.org())), include: bountyInclude }),
      this.prisma.githubRepo.count({ where: orgRepos(this.org()) }),
    ]);
    const contributors = new Set(bounties.flatMap((b) => b.pullRequests.map((pr) => pr.authorLogin.toLowerCase())));
    return { ...statsOf(bounties), repositoryCount, contributorCount: contributors.size };
  }

  /** Latest events across the organization, or in one repository. */
  async activity(repo?: string): Promise<ActivityItem[]> {
    const where = listedBounties(repo ? orgRepo(this.org(), repo) : orgRepos(this.org()));
    const bounties = await this.prisma.issue.findMany({ where, include: bountyInclude });
    const owner = this.owner();
    return bounties
      .flatMap((b) => {
        const { id, title, repository, issue } = toSummary(b);
        const bounty = { id, title, repository, issue, reward: rewardOf(b) };
        return eventsOf(b, owner).map((event) => ({ bounty, event }));
      })
      .sort((x, y) => y.event.at.localeCompare(x.event.at))
      .slice(0, ACTIVITY_LIMIT);
  }

  /** Every repository of the organization, most recently active first. */
  async repositories(): Promise<RepositorySummary[]> {
    const repos = await this.prisma.githubRepo.findMany({
      where: orgRepos(this.org()),
      include: { issues: { where: { githubIssueNumber: { not: null } }, include: bountyInclude } },
    });
    const owner = this.owner();
    return repos
      .map((repo) => toRepositorySummary(repo, repo.issues, owner))
      .sort(
        (a, b) => (b.lastActivityAt ?? '').localeCompare(a.lastActivityAt ?? '') || a.name.localeCompare(b.name),
      );
  }

  async repository(name: string): Promise<RepositorySummary> {
    const repo = await this.prisma.githubRepo.findFirst({
      where: orgRepo(this.org(), name),
      include: { issues: { where: { githubIssueNumber: { not: null } }, include: bountyInclude } },
    });
    if (!repo) throw new NotFoundException(`Repository ${name} is not part of ${this.org()}.`);
    return toRepositorySummary(repo, repo.issues, this.owner());
  }

  private org(): string {
    return this.config.get('GITHUB_ORG', { infer: true });
  }

  private owner(): GithubActor {
    return ownerActor(this.config.get('GITHUB_OWNER_LOGIN', { infer: true }));
  }
}
