import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Bounty, BountyListQuery, BountySummary, CreateBountyInput, GithubActor, MySubmission } from '@escrow/shared';
import { ownerActor } from '../auth/to-user';
import type { Env } from '../config/env';
import { IssueService } from '../issue/issue.service';
import { PrismaService } from '../prisma/prisma.service';
import { submissionInclude, toSubmission } from '../review/submission-view';
import { type BountyRecord, bountyInclude, listedBounties, orgRepo, orgRepos } from './bounty-query';
import { payoutOf, toBounty, toSummary } from './bounty-view';

/** Bounties of the organization in the shapes the web app reads. Funds are only ever touched through IssueService. */
@Injectable()
export class BountyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly issues: IssueService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async list(query: BountyListQuery): Promise<BountySummary[]> {
    const repo = query.repo ? orgRepo(this.org(), query.repo) : orgRepos(this.org());
    const records = await this.prisma.issue.findMany({ where: listedBounties(repo), include: bountyInclude });

    let list = records.map(toSummary);
    if (query.status) list = list.filter((b) => b.status === query.status);
    const q = query.q?.trim().toLowerCase().replace(/^#/, '');
    if (q) list = list.filter((b) => b.title.toLowerCase().includes(q) || String(b.issue.number) === q);

    return list.sort((a, b) =>
      query.sort === 'reward' ? compareAmounts(b.reward.amount, a.reward.amount) : b.createdAt.localeCompare(a.createdAt),
    );
  }

  async get(repo: string, issueNumber: number): Promise<Bounty> {
    const record = await this.prisma.issue.findFirst({
      where: { ...listedBounties(orgRepo(this.org(), repo)), githubIssueNumber: issueNumber },
      include: bountyInclude,
    });
    if (!record) throw new NotFoundException(`Bounty ${repo}#${issueNumber} does not exist.`);
    return toBounty(record, this.owner());
  }

  /** Locks the reward and opens the GitHub issue through IssueService, then answers with the new bounty. */
  async create(input: CreateBountyInput): Promise<Bounty> {
    const repo = await this.prisma.githubRepo.findFirst({ where: orgRepo(this.org(), input.repo) });
    if (!repo) throw new NotFoundException(`Repository ${input.repo} is not part of ${this.org()}.`);

    const created = await this.issues.create({
      title: input.title,
      body: input.body,
      rewardAmount: BigInt(input.rewardAmount),
      repoId: repo.id,
      labels: input.labels,
    });
    const record = await this.prisma.issue.findUniqueOrThrow({ where: { id: created.id }, include: bountyInclude });
    return toBounty(record, this.owner());
  }

  /** Pull requests the developer opened against bounties, latest activity first. */
  async mySubmissions(login: string): Promise<MySubmission[]> {
    const pulls = await this.prisma.pullRequest.findMany({
      where: {
        authorLogin: { equals: login, mode: 'insensitive' },
        issue: listedBounties(orgRepos(this.org())),
      },
      include: { ...submissionInclude, issue: { include: bountyInclude } },
    });
    return pulls
      .map((pr) => ({
        bounty: toSummary(pr.issue),
        submission: toSubmission(pr),
        payout: pr.state === 'merged' ? ownPayout(pr.issue, login) : null,
      }))
      .sort((x, y) => y.submission.updatedAt.localeCompare(x.submission.updatedAt));
  }

  private org(): string {
    return this.config.get('GITHUB_ORG', { infer: true });
  }

  private owner(): GithubActor {
    return ownerActor(this.config.get('GITHUB_OWNER_LOGIN', { infer: true }));
  }
}

/** The bounty's payout when it goes to this developer; another merged pull request may have won it. */
function ownPayout(bounty: BountyRecord, login: string) {
  const payout = payoutOf(bounty);
  return payout && payout.recipient.login.toLowerCase() === login.toLowerCase() ? payout : null;
}

function compareAmounts(a: string, b: string): number {
  const diff = BigInt(a) - BigInt(b);
  return diff === 0n ? 0 : diff > 0n ? 1 : -1;
}
