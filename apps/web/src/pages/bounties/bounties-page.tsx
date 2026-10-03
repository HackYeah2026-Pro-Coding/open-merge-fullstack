import type { TokenAmount } from '@escrow/shared';
import { useMySubmissions, useOrganization, useSession, useStats } from '@/api/queries';
import { cn } from '@/lib/cn';
import { sumAmounts } from '@/lib/format';
import { Container, PageHeader } from '@/components/layout/container';
import { BountyBrowser } from '@/components/bounty/bounty-browser';
import { Amount } from '@/components/common/amount';
import { Skeleton } from '@/components/ui/skeleton';

type HeaderStatProps = {
  label: string;
  value: TokenAmount | undefined;
  failed?: boolean;
  /** Overrides the amount's colour, e.g. green for money already paid out. */
  amountClassName?: string;
};

function HeaderStat({ label, value, failed, amountClassName }: HeaderStatProps) {
  return (
    <div className="text-left sm:text-right">
      <p className="label">{label}</p>
      {failed ? (
        <p className="mt-2 text-ui text-fg-muted">Could not load</p>
      ) : value ? (
        <Amount value={value} animate large className={cn('mt-1 block text-[22px] font-medium', amountClassName)} />
      ) : (
        <Skeleton className="mt-2 h-6 w-36" />
      )}
    </div>
  );
}

function EarnedStat({ token }: { token: TokenAmount | undefined }) {
  const mine = useMySubmissions(true);
  let earned: TokenAmount | undefined;
  if (mine.data && token) {
    const paid = mine.data.filter((m) => m.payout?.state === 'released').map((m) => m.bounty.reward);
    earned = sumAmounts(paid, token);
  }
  return <HeaderStat label="Earned by you" value={earned} failed={Boolean(mine.error)} amountClassName="text-ok" />;
}

export function BountiesPage() {
  const organization = useOrganization();
  const stats = useStats();
  const session = useSession();
  const user = session.data?.user;
  const isMaintainer = user?.role === 'maintainer';

  return (
    <Container>
      <PageHeader
        title={
          session.isPending ? (
            <span aria-hidden className="inline-block h-8 w-64 animate-pulse rounded-sm bg-surface-2 align-middle" />
          ) : isMaintainer ? (
            'Your repositories'
          ) : (
            'Browse repositories'
          )
        }
        description={
          <>
            Solve issues across the{' '}
            {organization.data ? (
              <a
                href={organization.data.url}
                target="_blank"
                rel="noreferrer"
                className="data text-fg hover:underline hover:underline-offset-4"
              >
                {organization.data.login}
              </a>
            ) : (
              <span aria-hidden className="inline-block h-4 w-40 animate-pulse rounded-sm bg-surface-2 align-middle" />
            )}{' '}
            repositories to claim upfront rewards. Submit a pull request that fixes an issue—once merged, your payment is released.
          </>
        }
        actions={
          <div className="flex gap-8">
            <HeaderStat label="Locked in escrow" value={stats.data?.locked} failed={Boolean(stats.error)} />
            {user && !isMaintainer && <EarnedStat token={stats.data?.locked} />}
          </div>
        }
      />
      <BountyBrowser emptyTitle="No bounties are posted yet. Watch the repository on GitHub to hear about the first one." />
    </Container>
  );
}
