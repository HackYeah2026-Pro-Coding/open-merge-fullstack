import type { ActivityItem, BountySummary, MySubmission, OrganizationStats, User } from '@escrow/shared';
import { env } from '@/lib/env';
import { ApiError, type ApiClient } from '../client';
import { delay, getDb, saveDb } from './db';
import { MOCK_DEVELOPER_ID } from './seed';
import { event, fake } from './factory';
import { checkOf, reviewer } from './reviews';
import { releaseHeldPayouts } from './simulate';
import type { MockBounty, MockRepository } from './types';
import {
  rewardOf,
  settleChecks,
  statsOf,
  toBounty,
  toRepositorySummary,
  toSubmission,
  toSummary,
} from './views';

const challenges = new Map<string, { userId: string; address: string; message: string; expiresAt: number }>();

function currentUser(): User | null {
  const db = getDb();
  if (db.ownerView) return db.users.find((u) => u.role === 'maintainer') ?? null;
  return db.users.find((u) => u.id === db.sessionUserId) ?? null;
}

function requireUser(): User {
  const user = currentUser();
  if (!user) throw new ApiError(401, 'Sign in to continue.');
  return user;
}

function findRepository(name: string): MockRepository {
  const repo = getDb().repositories.find((r) => r.name === name);
  if (!repo) throw new ApiError(404, `Repository ${name} is not part of ${env.githubOrg}.`);
  return repo;
}

function findBounty(repo: string, issueNumber: number): MockBounty {
  const bounty = getDb().bounties.find((b) => b.repo === repo && b.issueNumber === issueNumber);
  if (!bounty) throw new ApiError(404, `Bounty ${repo}#${issueNumber} does not exist.`);
  return bounty;
}

function owner(): User {
  const user = getDb().users.find((u) => u.role === 'maintainer');
  if (!user) throw new Error('Mock data has no owner');
  return user;
}

/** Pending checks settle lazily, whenever data is read. */
function settleAll(): void {
  let changed = false;
  for (const b of getDb().bounties) changed = settleChecks(b) || changed;
  if (changed) saveDb();
}

const rawMockApi: ApiClient = {
  async getSession() {
    await delay();
    return { user: currentUser() };
  },

  async signIn() {
    await delay();
    getDb().sessionUserId = MOCK_DEVELOPER_ID;
    saveDb();
  },

  async openOwnerView() {
    await delay();
    getDb().ownerView = true;
    saveDb();
  },

  async signOut() {
    await delay();
    const db = getDb();
    if (db.ownerView) db.ownerView = false;
    else db.sessionUserId = null;
    saveDb();
  },

  async getOrganization() {
    await delay();
    const o = owner();
    return {
      login: env.githubOrg,
      name: null,
      url: `https://github.com/${env.githubOrg}`,
      avatarUrl: `https://github.com/${env.githubOrg}.png`,
      owner: { login: o.githubLogin, avatarUrl: o.avatarUrl },
    };
  },

  async getStats(): Promise<OrganizationStats> {
    await delay();
    const db = getDb();
    const contributors = new Set(db.bounties.flatMap((b) => b.submissions.map((s) => s.author.login)));
    return {
      ...statsOf(db.bounties),
      repositoryCount: db.repositories.length,
      contributorCount: contributors.size,
    };
  },

  async listActivity(repo): Promise<ActivityItem[]> {
    await delay();
    return getDb()
      .bounties.filter((b) => !repo || b.repo === repo)
      .flatMap((b) => {
        const { id, title, repository, issue } = toSummary(b);
        return b.events.map((e) => ({ bounty: { id, title, repository, issue, reward: rewardOf(b) }, event: e }));
      })
      .sort((x, y) => y.event.at.localeCompare(x.event.at))
      .slice(0, 12);
  },

  async listRepositories() {
    await delay();
    settleAll();
    const db = getDb();
    return db.repositories
      .map((r) => toRepositorySummary(r, db.bounties))
      .sort(
        (a, b) =>
          (b.lastActivityAt ?? '').localeCompare(a.lastActivityAt ?? '') || a.name.localeCompare(b.name),
      );
  },

  async getRepository(name) {
    await delay();
    settleAll();
    return toRepositorySummary(findRepository(name), getDb().bounties);
  },

  async listBounties(query) {
    await delay();
    settleAll();
    const q = query.q?.trim().toLowerCase().replace(/^#/, '');
    let list: BountySummary[] = getDb()
      .bounties.filter((b) => !query.repo || b.repo === query.repo)
      .map(toSummary);
    if (query.status) list = list.filter((b) => b.status === query.status);
    if (q) list = list.filter((b) => b.title.toLowerCase().includes(q) || String(b.issue.number) === q);
    return list.sort((a, b) =>
      query.sort === 'reward'
        ? Number(BigInt(b.reward.amount) - BigInt(a.reward.amount))
        : b.createdAt.localeCompare(a.createdAt),
    );
  },

  async getBounty(repo, issueNumber) {
    await delay();
    settleAll();
    return toBounty(findBounty(repo, issueNumber));
  },

  async createBounty(input) {
    await delay();
    await delay();
    const user = requireUser();
    if (user.role !== 'maintainer') throw new ApiError(403, 'Only the owner can create bounties.');
    const repo = findRepository(input.repo);
    if (input.title.trim().length < 8) throw new ApiError(400, 'The title must be at least 8 characters.');
    if (BigInt(input.rewardAmount) <= 0n) throw new ApiError(400, 'The reward must be greater than zero.');

    const db = getDb();
    const now = new Date().toISOString();
    const maintainer = { login: user.githubLogin, avatarUrl: user.avatarUrl };
    const issueNumber = db.nextNumber[repo.name] ?? 1;
    db.nextNumber[repo.name] = issueNumber + 1;
    const bounty: MockBounty = {
      id: fake.id(),
      repo: repo.name,
      issueNumber,
      title: input.title.trim(),
      body: input.body.trim(),
      rewardAmount: input.rewardAmount,
      labels: input.labels,
      createdBy: user.githubLogin,
      createdAt: now,
      updatedAt: now,
      closedAt: null,
      submissions: [],
      events: [event('funded', now, { actor: maintainer, txSignature: fake.txSignature() })],
      payout: null,
    };
    db.bounties.push(bounty);
    saveDb();
    return toBounty(bounty);
  },

  async rerunReview(reviewId) {
    await delay();
    requireUser();
    const submission = getDb()
      .bounties.flatMap((b) => b.submissions)
      .find((s) => s.retryableReviewId === reviewId);
    if (!submission) throw new ApiError(409, 'Only a review that ended in an error can be run again.');
    const answers = submission.check.reviewers.map((r) =>
      r.verdict === 'error' ? reviewer(r.reviewer === 'Claude' ? 'Claude' : 'Gemini', 'approve', 'Acceptance criteria met.') : r,
    );
    submission.check = checkOf(
      reviewer('Claude', 'pending', null),
      reviewer('Gemini', 'pending', null),
    );
    submission.retryableReviewId = null;
    submission.checkResolvesAt = new Date(Date.now() + 6_000).toISOString();
    submission.checkOutcome = checkOf(answers[0], answers[1]);
    saveDb();
  },

  async listMySubmissions(): Promise<MySubmission[]> {
    await delay();
    settleAll();
    const user = requireUser();
    return getDb()
      .bounties.flatMap((b) =>
        b.submissions
          .filter((s) => s.author.login === user.githubLogin)
          .map((s) => ({
            bounty: toSummary(b),
            submission: toSubmission(s),
            payout: s.state === 'merged' ? b.payout : null,
          })),
      )
      .sort((x, y) => y.submission.updatedAt.localeCompare(x.submission.updatedAt));
  },

  async createWalletChallenge(address) {
    await delay();
    const user = requireUser();
    const nonce = fake.nonce();
    const issuedAt = new Date();
    const expiresAt = new Date(issuedAt.getTime() + 5 * 60_000);
    const message = [
      `OpenMerge wants to link this Solana wallet to the GitHub account @${user.githubLogin}.`,
      '',
      `Wallet: ${address}`,
      `Nonce: ${nonce}`,
      `Issued at: ${issuedAt.toISOString()}`,
      '',
      'Signing is free and does not send a transaction.',
    ].join('\n');
    challenges.set(nonce, { userId: user.id, address, message, expiresAt: expiresAt.getTime() });
    return { nonce, message, expiresAt: expiresAt.toISOString() };
  },

  async linkWallet(input) {
    await delay();
    const user = requireUser();
    const challenge = challenges.get(input.nonce);
    // The real API verifies the ed25519 signature; the mock checks the bookkeeping only.
    if (!challenge || challenge.userId !== user.id || challenge.address !== input.address) {
      throw new ApiError(400, 'The signing request is invalid. Start again.');
    }
    if (challenge.expiresAt < Date.now()) throw new ApiError(400, 'The signing request expired. Start again.');
    if (!input.signature) throw new ApiError(400, 'Missing signature.');
    challenges.delete(input.nonce);

    const db = getDb();
    const owner = db.users.find((u) => u.wallet?.address === input.address && u.id !== user.id);
    if (owner) throw new ApiError(409, 'This wallet is already linked to another GitHub account.');

    user.wallet = { address: input.address, linkedAt: new Date().toISOString() };
    releaseHeldPayouts(user);
    saveDb();
    return user;
  },

  async unlinkWallet() {
    await delay();
    const user = requireUser();
    user.wallet = null;
    saveDb();
    return user;
  },
};

/**
 * Hands out copies so cached query data never aliases the mock's own records,
 * just as JSON from a real API would not.
 */
function detached(client: ApiClient): ApiClient {
  const entries = Object.entries(client).map(([name, fn]: [string, (...args: unknown[]) => Promise<unknown>]) => [
    name,
    async (...args: unknown[]) => structuredClone(await fn(...args)),
  ]);
  return Object.fromEntries(entries) as ApiClient;
}

export const mockApi = detached(rawMockApi);
