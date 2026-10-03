import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { Plus } from 'lucide-react';
import { useProject, useStats } from '@/api/queries';
import { cn } from '@/lib/cn';
import { Container, PageHeader } from '@/components/layout/container';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Amount } from '@/components/common/amount';
import { ErrorState } from '@/components/common/states';
import { BountyBrowser } from '@/components/bounty/bounty-browser';
import { ActivityFeed } from './activity-feed';

function StatCard({ label, children, hint, className }: { label: string; children: ReactNode; hint: ReactNode; className?: string }) {
  return (
    <div className={cn('rounded-lg border bg-surface-1 px-5 py-4', className)}>
      <p className="label">{label}</p>
      <div className="mt-3 text-[26px] leading-none font-medium tracking-[-0.01em]">{children}</div>
      <p className="mt-2.5 text-[13px] text-fg-subtle">{hint}</p>
    </div>
  );
}

function Stats() {
  const stats = useStats();
  if (stats.isPending) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-busy>
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-[108px] rounded-lg" />
        ))}
      </div>
    );
  }
  if (stats.error) return <ErrorState error={stats.error} onRetry={() => void stats.refetch()} />;
  const s = stats.data;
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <StatCard label="Locked in escrow" hint="Across open, in-review and held bounties">
        <Amount value={s.locked} animate large />
      </StatCard>
      <StatCard label="Paid out" hint={`${s.paidCount} ${s.paidCount === 1 ? 'bounty' : 'bounties'} merged and paid`}>
        <Amount value={s.paid} animate large />
      </StatCard>
      <StatCard label="Open bounties" hint={`${s.contributorCount} developers have submitted`}>
        <span className="data">{s.openCount}</span>
      </StatCard>
      <StatCard label="Payouts held" hint={s.heldCount > 0 ? 'Waiting for a wallet or a decision' : 'Nothing waiting'}>
        <span className={cn('data', s.heldCount > 0 && 'text-warn')}>{s.heldCount}</span>
      </StatCard>
    </div>
  );
}

export function DashboardPage() {
  const project = useProject();
  const newBounty = (
    <Button asChild variant="primary">
      <Link to="/dashboard/new">
        <Plus />
        New bounty
      </Link>
    </Button>
  );

  return (
    <Container>
      <PageHeader
        eyebrow={project.data ? <span className="data normal-case tracking-normal">{project.data.owner}/{project.data.repo}</span> : 'Repository'}
        title="Dashboard"
        description="Rewards are locked when you post a bounty and released when you merge a pull request that resolves it."
        actions={newBounty}
      />
      <Stats />
      <div className="mt-10 grid grid-cols-[minmax(0,1fr)] gap-10 lg:grid-cols-[minmax(0,1fr)_300px]">
        <section aria-labelledby="bounties-title">
          <h2 id="bounties-title" className="mb-4 text-[17px] font-semibold tracking-[-0.01em]">
            Bounties
          </h2>
          <BountyBrowser emptyTitle="No bounties yet. Post one to open an issue on GitHub with a locked reward." emptyAction={newBounty} />
        </section>
        <section aria-labelledby="activity-title">
          <h2 id="activity-title" className="mb-4 text-[17px] font-semibold tracking-[-0.01em]">
            Activity
          </h2>
          <ActivityFeed />
        </section>
      </div>
    </Container>
  );
}
