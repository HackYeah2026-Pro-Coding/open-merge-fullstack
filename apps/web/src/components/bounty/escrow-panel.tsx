import type { ReactNode } from 'react';
import type { Bounty } from '@escrow/shared';
import { cn } from '@/lib/cn';
import { Amount } from '@/components/common/amount';
import { Skeleton } from '@/components/ui/skeleton';
import { escrowSteps } from './escrow-steps';
import { EscrowTimeline } from './escrow-timeline';

function lockStatus(bounty: Bounty): { dot: string; title: string; detail: string } {
  switch (bounty.status) {
    case 'open':
    case 'in_review':
      return {
        dot: 'bg-ok',
        title: 'Locked in escrow',
        detail: `Released when a pull request that resolves #${bounty.issue.number} is merged.`,
      };
    case 'payout_held':
      return { dot: 'bg-warn', title: 'Held after merge', detail: bounty.payout?.reason ?? 'Waiting for a decision.' };
    case 'paid':
      return {
        dot: 'bg-brand',
        title: 'Released',
        detail: bounty.payout ? `Sent to @${bounty.payout.recipient.login}.` : 'Sent to the developer.',
      };
    case 'closed':
      return { dot: 'bg-fg-subtle', title: 'Returned', detail: 'The issue was closed without a merge.' };
  }
}

/** Sticky panel: the reward, whether it is locked, and the path from funded to paid. */
export function EscrowPanel({ bounty, children }: { bounty: Bounty; children?: ReactNode }) {
  const lock = lockStatus(bounty);
  return (
    <section aria-label="Escrow" className="rounded-lg border bg-surface-1">
      <div className="p-5">
        <p className="label">Reward</p>
        <Amount value={bounty.reward} animate large className="mt-2 block text-[34px] leading-none font-medium tracking-[-0.02em]" />
        <div className="mt-3.5 flex items-start gap-2.5">
          <span className={cn('mt-[7px] size-1.5 shrink-0 rounded-full', lock.dot)} aria-hidden />
          <p className="text-ui">
            <span className="font-medium text-fg">{lock.title}</span>
            <span className="text-fg-muted"> · {lock.detail}</span>
          </p>
        </div>
      </div>
      <div className="border-t p-5">
        <p className="label mb-3.5">Timeline</p>
        <EscrowTimeline steps={escrowSteps(bounty)} />
      </div>
      {children && <div className="border-t p-5">{children}</div>}
    </section>
  );
}

export function EscrowPanelSkeleton() {
  return (
    <div className="rounded-lg border bg-surface-1 p-6" aria-hidden>
      <Skeleton className="h-3 w-14" />
      <Skeleton className="mt-3 h-8 w-44" />
      <Skeleton className="mt-4 h-4 w-full" />
      <div className="mt-8 space-y-5">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex gap-3">
            <Skeleton className="size-[22px] rounded-full" />
            <div className="flex-1">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="mt-2 h-3 w-1/3" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
