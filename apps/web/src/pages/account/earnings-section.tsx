import type { ReactNode } from 'react';
import { Link } from 'react-router';
import type { MySubmission } from '@escrow/shared';
import { GitPullRequest } from 'lucide-react';
import { useMySubmissions } from '@/api/queries';
import { cn } from '@/lib/cn';
import { sumAmounts } from '@/lib/format';
import { txUrl } from '@/lib/explorer';
import { paths } from '@/lib/paths';
import { Amount } from '@/components/common/amount';
import { KeyValue } from '@/components/common/key-value';
import { RelativeTime } from '@/components/common/relative-time';
import { EmptyState, ErrorState } from '@/components/common/states';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge, PR_STATE, toneText } from '@/components/bounty/status';
import { VerdictPill } from '@/components/bounty/verdict-pill';

const TOKEN = { symbol: 'USDC', decimals: 6 };

function PayoutCell({ item }: { item: MySubmission }) {
  if (item.payout?.state === 'released') {
    return (
      <span className="inline-flex items-center gap-2">
        <Badge tone="brand">Paid</Badge>
        {item.payout.txSignature && (
          <KeyValue value={item.payout.txSignature} label="payout transaction" href={txUrl(item.payout.txSignature)} />
        )}
      </span>
    );
  }
  if (item.payout?.state === 'held') return <Badge tone="warn">Held</Badge>;
  if (item.submission.state === 'open') return <VerdictPill check={item.submission.check} />;
  return <span className="text-[13px] text-fg-subtle">Not merged</span>;
}

function Row({ item }: { item: MySubmission }) {
  const state = PR_STATE[item.submission.state];
  const Icon = state.icon;
  return (
    <li className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 px-4 py-4 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:px-5">
      <Icon className={cn('mt-[3px] size-4', toneText[state.tone])} aria-label={`${state.label} pull request`} role="img" />
      <div className="min-w-0">
        <Link
          to={paths.bounty(item.bounty.repository.name, item.bounty.issue.number)}
          className="font-medium text-fg hover:underline hover:underline-offset-4"
        >
          {item.bounty.title}
        </Link>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-fg-subtle">
          <span className="data text-fg-muted">
            {item.bounty.repository.name}#{item.submission.prNumber}
          </span>
          <span aria-hidden>·</span>
          <span>
            updated <RelativeTime iso={item.submission.updatedAt} />
          </span>
        </div>
        <div className="mt-2.5 sm:hidden">
          <PayoutCell item={item} />
        </div>
      </div>
      <div className="hidden flex-col items-end gap-2 sm:flex">
        <Amount value={item.bounty.reward} className="text-[15px] font-medium" />
        <PayoutCell item={item} />
      </div>
    </li>
  );
}

function Stat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="rounded-md border bg-bg px-4 py-3.5">
      <p className="label">{label}</p>
      <div className="mt-2 text-[22px] leading-none font-medium">{children}</div>
    </div>
  );
}

export function EarningsSection() {
  const mine = useMySubmissions(true);

  if (mine.isPending) {
    return (
      <div className="space-y-4" aria-busy>
        <div className="grid gap-3 sm:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-[74px] rounded-md" />
          ))}
        </div>
        <Skeleton className="h-40 rounded-lg" />
      </div>
    );
  }
  if (mine.error) return <ErrorState error={mine.error} onRetry={() => void mine.refetch()} />;

  const paid = sumAmounts(mine.data.filter((m) => m.payout?.state === 'released').map((m) => m.bounty.reward), TOKEN);
  const held = sumAmounts(mine.data.filter((m) => m.payout?.state === 'held').map((m) => m.bounty.reward), TOKEN);
  const open = mine.data.filter((m) => m.submission.state === 'open').length;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Earned">
          <Amount value={paid} animate large className="text-ok" />
        </Stat>
        <Stat label="Held">
          <Amount value={held} animate large />
        </Stat>
        <Stat label="Open pull requests">
          <span className="data">{open}</span>
        </Stat>
      </div>
      {mine.data.length === 0 ? (
        <EmptyState
          icon={GitPullRequest}
          title="You have not opened a pull request against a bounty yet."
          action={
            <Link to="/bounties" className="text-ui font-medium text-brand hover:underline hover:underline-offset-4">
              Browse open bounties
            </Link>
          }
        />
      ) : (
        <ul className="divide-y rounded-lg border">
          {mine.data.map((item) => (
            <Row key={item.submission.id} item={item} />
          ))}
        </ul>
      )}
    </div>
  );
}
