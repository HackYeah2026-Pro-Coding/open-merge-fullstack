import { EscrowStatus } from '../../src/generated/prisma/client';
import { bounty, payout, pull } from '../../src/bounty/bounty-fixtures';
import { toBounty } from '../../src/bounty/bounty-view';
import { reviewOutputSchema } from '../../src/review/review-output';
import { loadFiller, type FillerBounty } from './filler-data';
import { FILLER_PR_BASE, fakeSha, fakeWalletAddress, issueBodyOf, planBounty, type PlannedBounty } from './filler-rows';

const NOW = new Date('2026-10-04T12:00:00.000Z');
const context = { now: NOW, models: { claude: 'claude-test', gemini: 'gemini-test' } };

const entry = (over: Partial<FillerBounty> = {}): FillerBounty => ({
  repo: 'r',
  title: 'Totals are off by a cent',
  problem: 'The totals are wrong.',
  expected: 'The totals add up.',
  criteria: ['Totals add up', 'Negative amounts work', 'A test covers it'],
  reward: 40,
  labels: ['bug'],
  state: 'in_review',
  author: 'ann',
  ageDays: 10,
  ...over,
});

/** The rows the planner wants written, put through the app's own view code. */
function viewOf(plan: PlannedBounty) {
  const results = (plan.pull?.review.results ?? []).map((r, i) => ({
    id: `result_${i}`,
    reviewId: 'review_1',
    reviewer: r.reviewer,
    model: r.model,
    verdict: r.verdict,
    output: r.output,
    error: null,
    inputTokens: null,
    outputTokens: null,
    sources: null,
    createdAt: plan.createdAt,
  }));
  const reviews = plan.pull
    ? [
        {
          id: 'review_1',
          pullRequestId: 'pr_1',
          headSha: plan.pull.headSha,
          status: 'completed' as const,
          ciState: 'passed' as const,
          failedJobs: [],
          contextNotes: [],
          error: null,
          createdAt: plan.pull.openedAt,
          completedAt: plan.pull.review.completedAt,
          results,
        },
      ]
    : [];
  return toBounty(
    bounty({
      rewardAmount: plan.rewardAmount,
      escrowStatus: plan.escrowStatus === 'RELEASED' ? EscrowStatus.RELEASED : EscrowStatus.FUNDED,
      closedAt: plan.closedAt,
      paidOutAt: plan.paidOutAt,
      createdAt: plan.createdAt,
      updatedAt: plan.updatedAt,
      payout: plan.payout ? payout({ releasedAt: plan.payout.releasedAt, walletAddress: plan.payout.walletAddress }) : null,
      pullRequests: plan.pull
        ? [pull({ state: plan.pull.state, headSha: plan.pull.headSha, openedAt: plan.pull.openedAt, updatedAt: plan.pull.updatedAt, reviews })]
        : [],
    }),
    { login: 'owner', avatarUrl: null },
  );
}

describe('planBounty, seen through the app\'s own view code', () => {
  it.each([
    ['open', 'open'],
    ['in_review', 'in_review'],
    ['in_review_split', 'in_review'],
    ['payout_held', 'payout_held'],
    ['paid', 'paid'],
    ['closed', 'closed'],
  ] as const)('a "%s" bounty shows as %s', (state, shown) => {
    const plan = planBounty(entry({ state, author: state === 'open' ? undefined : 'ann' }), 0, context);
    expect(viewOf(plan).status).toBe(shown);
  });

  it('gives an in-review bounty a green dual verdict and a split one a disagreement', () => {
    const agreed = viewOf(planBounty(entry({ state: 'in_review' }), 0, context)).submissions[0].check;
    expect(agreed.state).toBe('passed');
    expect(agreed.reviewers.map((r) => r.verdict)).toEqual(['approve', 'approve']);

    const split = viewOf(planBounty(entry({ state: 'in_review_split' }), 0, context)).submissions[0].check;
    expect(split.state).toBe('failed');
    expect(split.reviewers.map((r) => r.verdict)).toEqual(['approve', 'changes']);
  });

  it('has a closed bounty rejected by both reviewers', () => {
    const check = viewOf(planBounty(entry({ state: 'closed' }), 0, context)).submissions[0].check;
    expect(check.reviewers.map((r) => r.verdict)).toEqual(['changes', 'changes']);
  });

  it('holds a merged bounty for an author without a wallet and releases it for one with a wallet', () => {
    expect(viewOf(planBounty(entry({ state: 'payout_held' }), 0, context)).payout).toMatchObject({ state: 'held' });
    const paid = viewOf(planBounty(entry({ state: 'paid' }), 0, context)).payout;
    expect(paid).toMatchObject({ state: 'released', wallet: fakeWalletAddress('ann') });
  });
});

describe('planBounty', () => {
  it('stores the reward in base units and writes the issue the way a maintainer would', () => {
    const plan = planBounty(entry(), 0, context);
    expect(plan.rewardAmount).toBe(40_000_000n);
    expect(plan.body).toBe(issueBodyOf(entry()));
    expect(plan.body).toContain('## Problem\n\nThe totals are wrong.');
    expect(plan.body).toContain('- Totals add up\n- Negative amounts work');
  });

  it('keeps the timeline in order and in the past, whatever the age', () => {
    for (const ageDays of [0.25, 0.5, 3, 40]) {
      for (const state of ['in_review', 'payout_held', 'paid', 'closed'] as const) {
        const plan = planBounty(entry({ state, ageDays }), 0, context);
        const pr = plan.pull!;
        const times = [plan.createdAt, pr.openedAt, pr.review.completedAt, pr.updatedAt, plan.updatedAt].map((d) => d.getTime());
        expect(times).toEqual([...times].sort((a, b) => a - b));
        expect(Math.max(...times)).toBeLessThanOrEqual(NOW.getTime());
      }
    }
  });

  it('numbers pull requests apart from real issues, one per bounty', () => {
    expect(planBounty(entry(), 4, context).pull?.number).toBe(FILLER_PR_BASE + 4);
  });

  it('is repeatable: the same entry plans the same fake commit', () => {
    expect(planBounty(entry(), 1, context).pull?.headSha).toBe(planBounty(entry(), 1, context).pull?.headSha);
  });

  it('makes reviewer answers the app accepts, with the models it was told to name', () => {
    for (const state of ['in_review', 'in_review_split', 'closed'] as const) {
      const results = planBounty(entry({ state }), 0, context).pull!.review.results;
      for (const r of results) expect(reviewOutputSchema.parse(r.output).verdict).toBe(r.verdict);
      expect(results.map((r) => r.model)).toEqual(['claude-test', 'gemini-test']);
    }
  });

  it('marks the unsolved criteria when a reviewer asks for changes, even with a single criterion', () => {
    const [, gemini] = planBounty(entry({ state: 'in_review_split', criteria: ['Only one'] }), 0, context).pull!.review.results;
    expect(gemini.output.criteria).toEqual([expect.objectContaining({ criterion: 'Only one', status: 'not_met' })]);
  });
});

describe('fake identifiers', () => {
  it('are deterministic and shaped like the real thing', () => {
    expect(fakeSha('x')).toMatch(/^[0-9a-f]{40}$/);
    expect(fakeSha('x')).toBe(fakeSha('x'));
    expect(fakeWalletAddress('ann')).toMatch(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/);
    expect(fakeWalletAddress('ann')).not.toBe(fakeWalletAddress('bob'));
  });
});

describe('demo/filler.json', () => {
  it('plans every bounty without error and with answers the app accepts', () => {
    const { bounties } = loadFiller();
    const plans = bounties.map((b, i) => planBounty(b, i, context));
    expect(plans).toHaveLength(bounties.length);
    expect(new Set(plans.map((p) => p.pull?.number).filter(Boolean)).size).toBe(plans.filter((p) => p.pull).length);
  });
});
