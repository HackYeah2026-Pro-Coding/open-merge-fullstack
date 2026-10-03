import { useOrganization, useStats } from '@/api/queries';
import { Container, PageHeader } from '@/components/layout/container';
import { BountyBrowser } from '@/components/bounty/bounty-browser';
import { Amount } from '@/components/common/amount';
import { Skeleton } from '@/components/ui/skeleton';

export function BountiesPage() {
  const organization = useOrganization();
  const stats = useStats();

  return (
    <Container>
      <PageHeader
        title="Bounties"
        description={
          <>
            Issues across the{' '}
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
            repositories with a reward locked up front. Open a pull request that resolves one; the merge releases the payment.
          </>
        }
        actions={
          <div className="text-left sm:text-right">
            <p className="label">Locked in escrow</p>
            {stats.data ? (
              <Amount value={stats.data.locked} animate large className="mt-1 block text-[22px] font-medium" />
            ) : (
              <Skeleton className="mt-2 h-6 w-36" />
            )}
          </div>
        }
      />
      <BountyBrowser emptyTitle="No bounties are posted yet. Watch the repository on GitHub to hear about the first one." />
    </Container>
  );
}
