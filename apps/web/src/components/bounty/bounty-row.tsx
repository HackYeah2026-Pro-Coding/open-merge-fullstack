import { Link } from 'react-router';
import type { BountySummary } from '@escrow/shared';
import { GitPullRequest } from 'lucide-react';
import { formatExact, formatRelative } from '@/lib/format';
import { Amount } from '@/components/common/amount';
import { Skeleton } from '@/components/ui/skeleton';
import { BOUNTY_STATUS, StatusIcon, toneText } from './status';

export function Labels({ labels }: { labels: string[] }) {
  return (
    <>
      {labels.map((label) => (
        <span key={label} className="inline-flex h-5 items-center rounded-full border px-2 text-[11.5px] leading-none text-fg-muted">
          {label}
        </span>
      ))}
    </>
  );
}

/** One bounty in a list. The whole row is the link. */
export function BountyRow({ bounty }: { bounty: BountySummary }) {
  const status = BOUNTY_STATUS[bounty.status];
  return (
    <li>
      <Link
        to={`/bounties/${bounty.issue.number}`}
        className="group grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-x-3 px-4 py-3.5 outline-offset-[-2px] transition-colors duration-120 hover:bg-surface-1 sm:px-5"
      >
        <StatusIcon status={bounty.status} className="mt-[3px]" />
        <div className="min-w-0">
          <p className="truncate font-medium text-fg group-hover:text-fg">{bounty.title}</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-[13px] text-fg-subtle">
            <span className="data text-fg-muted">#{bounty.issue.number}</span>
            <span aria-hidden>·</span>
            <span className={toneText[status.tone]}>{status.label}</span>
            <span aria-hidden>·</span>
            <time dateTime={bounty.createdAt} title={formatExact(bounty.createdAt)}>
              opened {formatRelative(bounty.createdAt)}
            </time>
            {bounty.submissionCount > 0 && (
              <>
                <span aria-hidden>·</span>
                <span className="inline-flex items-center gap-1">
                  <GitPullRequest className="size-3.5" aria-hidden />
                  <span className="data">{bounty.submissionCount}</span>
                  <span className="sr-only">pull requests</span>
                </span>
              </>
            )}
            {bounty.labels.length > 0 && (
              <span className="hidden items-center gap-1.5 sm:inline-flex">
                <Labels labels={bounty.labels} />
              </span>
            )}
          </div>
        </div>
        <Amount value={bounty.reward} className="pt-px text-[15px] font-medium" />
      </Link>
    </li>
  );
}

export function BountyRowSkeleton() {
  return (
    <li className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-x-3 px-4 py-3.5 sm:px-5" aria-hidden>
      <Skeleton className="mt-[3px] size-4 rounded-full" />
      <div>
        <Skeleton className="h-4 w-3/5" />
        <Skeleton className="mt-2.5 h-3 w-2/5" />
      </div>
      <Skeleton className="h-4 w-24" />
    </li>
  );
}
