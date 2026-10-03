import type { ActivityItem, BountySummary, MySubmission, ProjectStats, User } from '@escrow/shared';
import { env } from '@/lib/env';
import { ApiError, type ApiClient } from '../client';
import { delay, getDb, saveDb } from './db';
import { event, fake } from './factory';
import { releaseHeldPayouts } from './simulate';
import { MOCK_TOKEN, type MockBounty } from './types';
import { rewardOf, settleChecks, statusOf, toBounty, toSubmission, toSummary } from './views';

const challenges = new Map<string, { userId: string; address: string; message: string; expiresAt: number }>();

function currentUser(): User | null {
  const db = getDb();
  return db.users.find((u) => u.id === db.sessionUserId) ?? null;
}

function requireUser(): User {
  const user = currentUser();
  if (!user) throw new ApiError(401, 'Sign in to continue.');
  return user;
}

function findBounty(issueNumber: number): MockBounty {
  const bounty = getDb().bounties.find((b) => b.issueNumber === issueNumber);
  if (!bounty) throw new ApiError(404, `Bounty #${issueNumber} does not exist.`);
  return bounty;
}

/** Pending checks settle lazily, whenever data is read. */
function settleAll(): void {
  let changed = false;
  for (const b of getDb().bounties) changed = settleChecks(b) || changed;
  if (changed) saveDb();
}

function sum(bounties: MockBounty[]) {
  return { amount: bounties.reduce((acc, b) => acc + BigInt(b.rewardAmount), 0n).toString(), ...MOCK_TOKEN };
}

const rawMockApi: ApiClient = {
  async getSession() {
    await delay();
    return { user: currentUser() };
  },

  async signIn() {
    await delay();
    const db = getDb();
    db.sessionUserId = db.signInAsUserId;
    saveDb();
  },

  async signOut() {
    await delay();
    getDb().sessionUserId = null;
    saveDb();
  },

  async getProject() {
    await delay();
    const [owner = '', repo = ''] = env.githubRepo.split('/');
    const maintainer = getDb().users.find((u) => u.role === 'maintainer');
    if (!maintainer) throw new Error('Mock data has no maintainer');
    return {
      owner,
      repo,
      url: `https://github.com/${env.githubRepo}`,
      maintainer: { login: maintainer.githubLogin, avatarUrl: maintainer.avatarUrl },
    };
  },

  async getStats(): Promise<ProjectStats> {
    await delay();
    const bounties = getDb().bounties;
    const by = (...statuses: string[]) => bounties.filter((b) => statuses.includes(statusOf(b)));
    const contributors = new Set(bounties.flatMap((b) => b.submissions.map((s) => s.author.login)));
    return {
      locked: sum(by('open', 'in_review', 'payout_held')),
      paid: sum(by('paid')),
      openCount: by('open', 'in_review').length,
      paidCount: by('paid').length,
      heldCount: by('payout_held').length,
      contributorCount: contributors.size,
    };
  },

  async listActivity(): Promise<ActivityItem[]> {
    await delay();
    return getDb()
      .bounties.flatMap((b) =>
        b.events.map((e) => ({
          bounty: { id: b.id, title: b.title, issue: toSummary(b).issue, reward: rewardOf(b) },
          event: e,
        })),
      )
      .sort((x, y) => y.event.at.localeCompare(x.event.at))
      .slice(0, 12);
  },

  async listBounties(query) {
    await delay();
    settleAll();
    const q = query.q?.trim().toLowerCase().replace(/^#/, '');
    let list: BountySummary[] = getDb().bounties.map(toSummary);
    if (query.status) list = list.filter((b) => b.status === query.status);
    if (q) list = list.filter((b) => b.title.toLowerCase().includes(q) || String(b.issue.number) === q);
    return list.sort((a, b) =>
      query.sort === 'reward'
        ? Number(BigInt(b.reward.amount) - BigInt(a.reward.amount))
        : b.createdAt.localeCompare(a.createdAt),
    );
  },

  async getBounty(issueNumber) {
    await delay();
    settleAll();
    return toBounty(findBounty(issueNumber));
  },

  async createBounty(input) {
    await delay();
    await delay();
    const user = requireUser();
    if (user.role !== 'maintainer') throw new ApiError(403, 'Only the maintainer can create bounties.');
    if (input.title.trim().length < 8) throw new ApiError(400, 'The title must be at least 8 characters.');
    if (BigInt(input.rewardAmount) <= 0n) throw new ApiError(400, 'The reward must be greater than zero.');

    const db = getDb();
    const now = new Date().toISOString();
    const maintainer = { login: user.githubLogin, avatarUrl: user.avatarUrl };
    const bounty: MockBounty = {
      id: fake.id(),
      issueNumber: db.nextIssueNumber++,
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
