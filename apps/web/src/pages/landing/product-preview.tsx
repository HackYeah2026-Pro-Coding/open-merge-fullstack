import type { BountyEvent, Submission } from '@escrow/shared';
import { ChevronRight } from 'lucide-react';
import { Amount } from '@/components/common/amount';
import { EscrowTimeline } from '@/components/bounty/escrow-timeline';
import { escrowSteps } from '@/components/bounty/escrow-steps';
import { PullRequestRow } from '@/components/bounty/pull-request-row';
import { StatusBadge } from '@/components/bounty/status';

const HOUR = 3_600_000;
const ago = (h: number) => new Date(Date.now() - h * HOUR).toISOString();

const REWARD = { amount: '750000000', symbol: 'USDC', decimals: 6 };

/** A reviewer's half of the pill; the preview shows verdicts only, so no detail is needed. */
const half = (reviewer: string, verdict: 'approve' | 'changes') => ({
  reviewer,
  verdict,
  summary: null,
  model: null,
  confidence: null,
  criteria: [],
  risks: [],
  sources: [],
});

const PRS: Submission[] = [
  {
    id: 'preview-43',
    prNumber: 43,
    title: 'fix(queue): retry timed-out jobs with idempotent re-enqueue',
    url: '#',
    author: { login: 'devon-ray', avatarUrl: null },
    state: 'open',
    headSha: 'a3f9c1e7b2d4f0a9c8e1d2b3a4f5e6d7c8b9a0f1',
    check: {
      state: 'passed',
      reviewers: [
        half('Claude', 'approve'),
        half('Gemini', 'approve'),
      ],
    },
    ci: { state: 'passed', failedJobs: [] },
    retryableReviewId: null,
    reviewedAt: ago(3),
    openedAt: ago(20),
    updatedAt: ago(3),
  },
  {
    id: 'preview-41',
    prNumber: 41,
    title: 'fix(queue): count timeouts as failed attempts',
    url: '#',
    author: { login: 'sam-oduya', avatarUrl: null },
    state: 'open',
    headSha: '9be04d1c6a7f3e2b1d0c9a8f7e6d5c4b3a2f1e0d',
    check: {
      state: 'failed',
      reviewers: [
        half('Claude', 'changes'),
        half('Gemini', 'approve'),
      ],
    },
    ci: { state: 'passed', failedJobs: [] },
    retryableReviewId: null,
    reviewedAt: ago(30),
    openedAt: ago(120),
    updatedAt: ago(30),
  },
];

const event = (type: BountyEvent['type'], at: string, extra: Partial<BountyEvent> = {}): BountyEvent => ({
  type,
  at,
  actor: null,
  prNumber: null,
  commitSha: null,
  txSignature: null,
  note: null,
  ...extra,
});

const EVENTS = [
  event('funded', ago(216), { txSignature: '4sGjMW1sUnHzSxGspuhpqLDx6wiyjNtZAMdL4VZHirAn' }),
  event('pr_opened', ago(120), { prNumber: 41, actor: { login: 'sam-oduya', avatarUrl: null } }),
];

/** A still of the product built from the real components, so it never drifts from the app. */
export function ProductPreview() {
  return (
    <div inert aria-hidden className="overflow-hidden rounded-lg border bg-surface-1 select-none">
      <div className="flex items-center justify-between gap-3 border-b px-5 py-3">
        <div className="flex items-center gap-1.5 text-[13px] text-fg-subtle">
          Bounties <ChevronRight className="size-3.5" /> <span className="data">taskq</span>
          <ChevronRight className="size-3.5" /> <span className="data text-fg-muted">#12</span>
        </div>
        <StatusBadge status="in_review" />
      </div>
      <div className="grid sm:grid-cols-[minmax(0,1fr)_210px]">
        <div className="min-w-0 p-5">
          <p className="text-[17px] font-semibold tracking-[-0.01em] text-fg">Retry queue drops jobs that time out mid-flight</p>
          <p className="mt-1 text-[13px] text-fg-subtle">2 pull requests · checked on every push</p>
          <ul className="mt-4 divide-y rounded-md border bg-bg [&>li]:px-4">
            {PRS.map((pr) => (
              <PullRequestRow key={pr.id} submission={pr} />
            ))}
          </ul>
        </div>
        <div className="border-t p-5 sm:border-t-0 sm:border-l">
          <p className="label">Reward</p>
          <Amount value={REWARD} animate large className="mt-2 block text-[26px] leading-none font-medium tracking-[-0.02em]" />
          <div className="mt-6">
            <EscrowTimeline steps={escrowSteps({ events: EVENTS })} />
          </div>
        </div>
      </div>
    </div>
  );
}
