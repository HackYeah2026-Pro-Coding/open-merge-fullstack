import { createHash } from 'node:crypto';
import type { ReviewOutput } from '../../src/review/review-output';
import type { FillerBounty, FillerState } from './filler-data';
import { REWARD_SYMBOL, toBaseUnits } from './reward';

const DAY = 86_400_000;
const MINUTE = 60_000;
const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

/** Pull request numbers of filler bounties start here, clear of the real issue numbers GitHub hands out. */
export const FILLER_PR_BASE = 100;

type Verdict = ReviewOutput['verdict'];

export interface PlannedResult {
  reviewer: 'claude' | 'gemini';
  model: string;
  verdict: Verdict;
  output: ReviewOutput;
}

/** One filler bounty as database rows, before ids exist: everything but the GitHub issue number and account links. */
export interface PlannedBounty {
  repo: string;
  title: string;
  body: string;
  labels: string[];
  rewardAmount: bigint;
  rewardSymbol: string;
  escrowStatus: 'FUNDED' | 'RELEASED';
  createdAt: Date;
  updatedAt: Date;
  closedAt: Date | null;
  paidOutAt: Date | null;
  authorLogin: string | null;
  pull: {
    number: number;
    title: string;
    state: 'open' | 'merged' | 'closed';
    headSha: string;
    openedAt: Date;
    updatedAt: Date;
    review: { completedAt: Date; results: PlannedResult[] };
  } | null;
  /** Set when the reward was released. The signature stays empty: no transaction exists. */
  payout: { releasedAt: Date; walletAddress: string } | null;
}

export interface PlanContext {
  now: Date;
  models: { claude: string; gemini: string };
}

/** What the maintainer wrote in the issue, from the fields of one filler entry. */
export function issueBodyOf(entry: Pick<FillerBounty, 'problem' | 'expected' | 'criteria'>): string {
  const criteria = entry.criteria.map((c) => `- ${c}`).join('\n');
  return `## Problem\n\n${entry.problem}\n\n## Expected\n\n${entry.expected}\n\n## Acceptance criteria\n\n${criteria}\n`;
}

/** Stable and fake: the same input always gives the same value, so re-running the filler rewrites identical rows. */
export function fakeSha(seed: string): string {
  return createHash('sha1').update(seed).digest('hex');
}

function encodeBase58(bytes: Uint8Array): string {
  let value = BigInt(`0x${Buffer.from(bytes).toString('hex')}`);
  let out = '';
  while (value > 0n) {
    out = ALPHABET[Number(value % 58n)] + out;
    value /= 58n;
  }
  const zeros = bytes.findIndex((b) => b !== 0);
  return '1'.repeat(zeros === -1 ? bytes.length : zeros) + out;
}

/** A well-formed but unowned Solana address: 32 hashed bytes, so explorer links open an empty account. */
export function fakeWalletAddress(login: string): string {
  return encodeBase58(createHash('sha256').update(`wallet:${login}`).digest());
}

function reviewOutput(verdict: Verdict, criteria: string[]): ReviewOutput {
  if (verdict === 'approve') {
    return {
      verdict,
      confidence: 'high',
      criteria: criteria.map((criterion) => ({ criterion, status: 'met', evidence: 'Handled by the change and covered by its tests.' })),
      risks: [],
      developerFeedback: 'Every acceptance criterion is met, and the change is small and tested. Thanks for the clean fix.',
      maintainerSummary: 'Meets every acceptance criterion and adds tests. Safe to merge.',
    };
  }
  // The later criteria are the ones left unsolved; at least one always is.
  const metCount = criteria.length - Math.max(1, Math.floor(criteria.length / 2));
  const missing = criteria.slice(metCount);
  return {
    verdict,
    confidence: 'medium',
    criteria: criteria.map((criterion, i) => ({
      criterion,
      status: i < metCount ? 'met' : 'not_met',
      evidence: i < metCount ? 'Handled by the change.' : 'Not handled by the change, and no test covers it.',
    })),
    risks: ['The change leaves part of the issue unsolved.'],
    developerFeedback: `Good start. These criteria are still open:\n\n${missing.map((c) => `- ${c}`).join('\n')}`,
    maintainerSummary: `Does not meet every criterion yet: ${missing[0]}`,
  };
}

/** Verdict of [Claude, Gemini] for each state that has a review. */
const VERDICTS: Record<Exclude<FillerState, 'open'>, [Verdict, Verdict]> = {
  in_review: ['approve', 'approve'],
  in_review_split: ['approve', 'changes'],
  payout_held: ['approve', 'approve'],
  paid: ['approve', 'approve'],
  closed: ['changes', 'changes'],
};

const PULL_STATE = { in_review: 'open', in_review_split: 'open', payout_held: 'merged', paid: 'merged', closed: 'closed' } as const;

/** Turns one filler entry into the rows that make it show as that state in the app. */
export function planBounty(entry: FillerBounty, index: number, context: PlanContext): PlannedBounty {
  const createdAt = new Date(context.now.getTime() - entry.ageDays * DAY);
  const at = (fraction: number) => new Date(createdAt.getTime() + fraction * (context.now.getTime() - createdAt.getTime()));
  const base = {
    repo: entry.repo,
    title: entry.title,
    body: issueBodyOf(entry),
    labels: entry.labels,
    rewardAmount: toBaseUnits(entry.reward),
    rewardSymbol: REWARD_SYMBOL,
    createdAt,
  };

  if (entry.state === 'open') {
    return { ...base, escrowStatus: 'FUNDED', updatedAt: createdAt, closedAt: null, paidOutAt: null, authorLogin: null, pull: null, payout: null };
  }

  const state = entry.state;
  const author = entry.author as string;
  const openedAt = at(0.3);
  const reviewedAt = new Date(openedAt.getTime() + 4 * MINUTE);
  const pullState = PULL_STATE[state];
  // A merged or closed pull request is not touched again, so its last update is when it ended.
  const endedAt = pullState === 'merged' ? at(0.75) : pullState === 'closed' ? at(0.8) : reviewedAt;
  const [claude, gemini] = VERDICTS[state];
  const releasedAt = new Date(endedAt.getTime() + MINUTE);

  return {
    ...base,
    escrowStatus: state === 'paid' ? 'RELEASED' : 'FUNDED',
    updatedAt: state === 'paid' ? releasedAt : endedAt,
    closedAt: state === 'closed' ? endedAt : null,
    paidOutAt: state === 'paid' ? releasedAt : null,
    authorLogin: author,
    pull: {
      number: FILLER_PR_BASE + index,
      title: `fix: ${entry.title.charAt(0).toLowerCase()}${entry.title.slice(1)}`,
      state: pullState,
      headSha: fakeSha(`${entry.repo}/${entry.title}`),
      openedAt,
      updatedAt: endedAt,
      review: {
        completedAt: reviewedAt,
        results: (['claude', 'gemini'] as const).map((reviewer, i) => ({
          reviewer,
          model: context.models[reviewer],
          verdict: [claude, gemini][i],
          output: reviewOutput([claude, gemini][i], entry.criteria),
        })),
      },
    },
    payout: state === 'paid' ? { releasedAt, walletAddress: fakeWalletAddress(author) } : null,
  };
}
