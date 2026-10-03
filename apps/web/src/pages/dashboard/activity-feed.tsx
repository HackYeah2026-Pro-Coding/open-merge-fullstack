import { Link } from 'react-router';
import type { ActivityItem, BountyEventType } from '@escrow/shared';
import { Activity, CircleCheck, CircleDot, Clock, GitMerge, GitPullRequest, Undo2, type LucideIcon } from 'lucide-react';
import { useActivity } from '@/api/queries';
import { cn } from '@/lib/cn';
import { Amount } from '@/components/common/amount';
import { RelativeTime } from '@/components/common/relative-time';
import { EmptyState, ErrorState } from '@/components/common/states';
import { Skeleton } from '@/components/ui/skeleton';
import { toneText, type Tone } from '@/components/bounty/status';

const EVENT: Record<BountyEventType, { icon: LucideIcon; tone: Tone }> = {
  funded: { icon: CircleDot, tone: 'ok' },
  pr_opened: { icon: GitPullRequest, tone: 'ok' },
  merged: { icon: GitMerge, tone: 'brand' },
  paid: { icon: CircleCheck, tone: 'brand' },
  payout_held: { icon: Clock, tone: 'warn' },
  refunded: { icon: Undo2, tone: 'neutral' },
};

function Describe({ item }: { item: ActivityItem }) {
  const { event, bounty } = item;
  const who = event.actor ? <span className="text-fg">@{event.actor.login}</span> : null;
  const issue = (
    <Link to={`/bounties/${bounty.issue.number}`} className="data text-fg hover:underline hover:underline-offset-4">
      #{bounty.issue.number}
    </Link>
  );
  const pr = <span className="data text-fg">#{event.prNumber}</span>;

  switch (event.type) {
    case 'funded':
      return <>{issue} posted, <Amount value={bounty.reward} /> locked</>;
    case 'pr_opened':
      return <>{who} opened {pr} for {issue}</>;
    case 'merged':
      return <>{pr} merged, resolving {issue}</>;
    case 'paid':
      return <><Amount value={bounty.reward} /> paid to {who}</>;
    case 'payout_held':
      return <>Payout for {issue} held{event.note ? `: ${event.note}` : ''}</>;
    case 'refunded':
      return <>{issue} closed, <Amount value={bounty.reward} /> returned</>;
  }
}

export function ActivityFeed() {
  const activity = useActivity();

  if (activity.isPending) {
    return (
      <div className="space-y-5" aria-busy>
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="flex gap-3">
            <Skeleton className="size-4 rounded-full" />
            <div className="flex-1">
              <Skeleton className="h-3.5 w-11/12" />
              <Skeleton className="mt-2 h-3 w-16" />
            </div>
          </div>
        ))}
      </div>
    );
  }
  if (activity.error) return <ErrorState error={activity.error} onRetry={() => void activity.refetch()} />;
  if (activity.data.length === 0) {
    return <EmptyState icon={Activity} title="Activity shows up here once the first bounty is posted." />;
  }

  return (
    <ol className="space-y-4">
      {activity.data.map((item, i) => {
        const { icon: Icon, tone } = EVENT[item.event.type];
        return (
          <li key={`${item.bounty.id}-${item.event.type}-${item.event.at}-${i}`} className="grid grid-cols-[16px_minmax(0,1fr)] gap-x-3">
            <Icon className={cn('mt-[3px] size-4', toneText[tone])} aria-hidden />
            <div className="min-w-0 text-[13px] leading-relaxed text-fg-muted">
              <p>
                <Describe item={item} />
              </p>
              <RelativeTime iso={item.event.at} className="text-[12px] text-fg-subtle" />
            </div>
          </li>
        );
      })}
    </ol>
  );
}
