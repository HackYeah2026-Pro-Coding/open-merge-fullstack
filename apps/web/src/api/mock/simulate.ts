import type { User } from '@escrow/shared';
import { env } from '@/lib/env';
import { getDb, saveDb } from './db';
import { event, fake } from './factory';
import type { MockBounty, MockSubmission } from './types';

/**
 * Stand-ins for what GitHub webhooks and the escrow program do in production.
 * Only the mock panel calls these; the app itself never moves funds.
 */

const actorOf = (user: User) => ({ login: user.githubLogin, avatarUrl: user.avatarUrl });

function findBounty(issueNumber: number): MockBounty {
  const bounty = getDb().bounties.find((b) => b.issueNumber === issueNumber);
  if (!bounty) throw new Error(`Mock bounty #${issueNumber} does not exist`);
  return bounty;
}

function maintainer(): User {
  const user = getDb().users.find((u) => u.role === 'maintainer');
  if (!user) throw new Error('Mock data has no maintainer');
  return user;
}

/** Releases payouts that were held only because the developer had no wallet. */
export function releaseHeldPayouts(user: User): void {
  if (!user.wallet) return;
  const now = new Date().toISOString();
  for (const b of getDb().bounties) {
    if (b.payout?.state !== 'held' || b.payout.recipient.login !== user.githubLogin) continue;
    const txSignature = fake.txSignature();
    const merged = b.submissions.find((s) => s.state === 'merged');
    b.payout = { ...b.payout, state: 'released', wallet: user.wallet.address, txSignature, reason: null };
    b.events.push(event('paid', now, { actor: actorOf(user), prNumber: merged?.prNumber ?? null, txSignature }));
    b.updatedAt = now;
  }
}

/** A developer opens a pull request that references the issue. */
export function simulateOpenPullRequest(issueNumber: number, author: User): MockSubmission {
  const db = getDb();
  const bounty = findBounty(issueNumber);
  const now = new Date();
  const number = db.nextPrNumber++;
  const submission: MockSubmission = {
    id: fake.id(),
    prNumber: number,
    title: `fix: resolve #${issueNumber}`,
    url: `https://github.com/${env.githubRepo}/pull/${number}`,
    author: actorOf(author),
    state: 'open',
    headSha: fake.sha(),
    check: {
      state: 'pending',
      reviewers: [
        { reviewer: 'Claude', verdict: 'pending', summary: null },
        { reviewer: 'Gemini', verdict: 'pending', summary: null },
      ],
    },
    openedAt: now.toISOString(),
    updatedAt: now.toISOString(),
    checkResolvesAt: new Date(now.getTime() + 8_000).toISOString(),
    checkOutcome: {
      state: 'passed',
      reviewers: [
        { reviewer: 'Claude', verdict: 'approve', summary: 'Change matches the issue and includes a test.' },
        { reviewer: 'Gemini', verdict: 'approve', summary: 'Acceptance criteria met.' },
      ],
    },
  };
  bounty.submissions.push(submission);
  bounty.events.push(event('pr_opened', submission.openedAt, { actor: submission.author, prNumber: number }));
  bounty.updatedAt = submission.openedAt;
  saveDb();
  return submission;
}

/**
 * The maintainer merges. For now the payout follows the merge directly; the
 * review gate described in AGENTS.md is not wired yet.
 */
export function simulateMerge(issueNumber: number, prNumber: number): void {
  const db = getDb();
  const bounty = findBounty(issueNumber);
  const pr = bounty.submissions.find((s) => s.prNumber === prNumber);
  if (!pr || pr.state !== 'open') throw new Error(`PR #${prNumber} is not open`);

  const now = new Date().toISOString();
  const by = actorOf(maintainer());
  pr.state = 'merged';
  pr.updatedAt = now;
  for (const other of bounty.submissions) {
    if (other !== pr && other.state === 'open') {
      other.state = 'closed';
      other.updatedAt = now;
    }
  }
  bounty.events.push(event('merged', now, { actor: by, prNumber, commitSha: pr.headSha }));

  const author = db.users.find((u) => u.githubLogin === pr.author.login);
  if (author?.wallet) {
    const txSignature = fake.txSignature();
    bounty.payout = { recipient: pr.author, state: 'released', wallet: author.wallet.address, txSignature, reason: null };
    bounty.events.push(event('paid', now, { actor: pr.author, prNumber, txSignature }));
  } else {
    const reason = `No wallet linked for @${pr.author.login}`;
    bounty.payout = { recipient: pr.author, state: 'held', wallet: null, txSignature: null, reason };
    bounty.events.push(event('payout_held', now, { actor: pr.author, prNumber, note: reason }));
  }
  bounty.updatedAt = now;
  saveDb();
}

export function setMockSession(userId: string | null): void {
  const db = getDb();
  db.sessionUserId = userId;
  if (userId) db.signInAsUserId = userId;
  saveDb();
}
