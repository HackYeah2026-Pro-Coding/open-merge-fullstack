import type { ReactNode } from 'react';
import type { BountyStats } from '@escrow/shared';
import { cn } from '@/lib/cn';
import { pluralize } from '@/lib/format';
import { Skeleton } from '@/components/ui/skeleton';
import { Amount } from '@/components/common/amount';

function StatCard({ label, children, hint }: { label: string; children: ReactNode; hint: ReactNode }) {
  return (
    <div className="rounded-lg border bg-surface-1 px-5 py-4">
      <p className="label">{label}</p>
      <div className="mt-3 text-[26px] leading-none font-medium tracking-[-0.01em]">{children}</div>
      <p className="mt-2.5 text-[13px] text-fg-subtle">{hint}</p>
    </div>
  );
}

/** Locked, paid, open and held: the same four figures for the organization or one repository. */
export function StatCards({ stats, openHint }: { stats: BountyStats; openHint: ReactNode }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <StatCard label="Locked in escrow" hint="Across open, in-review and held bounties">
        <Amount value={stats.locked} animate large />
      </StatCard>
      <StatCard label="Paid out" hint={`${pluralize(stats.paidCount, 'bounty', 'bounties')} merged and paid`}>
        <Amount value={stats.paid} animate large />
      </StatCard>
      <StatCard label="Open bounties" hint={openHint}>
        <span className="data">{stats.openCount}</span>
      </StatCard>
      <StatCard label="Payouts held" hint={stats.heldCount > 0 ? 'Waiting for a wallet or a decision' : 'Nothing waiting'}>
        <span className={cn('data', stats.heldCount > 0 && 'text-warn')}>{stats.heldCount}</span>
      </StatCard>
    </div>
  );
}

export function StatCardsSkeleton() {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-busy>
      {[0, 1, 2, 3].map((i) => (
        <Skeleton key={i} className="h-[108px] rounded-lg" />
      ))}
    </div>
  );
}
