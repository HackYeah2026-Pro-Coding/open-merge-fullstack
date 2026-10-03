import { Link, useParams } from 'react-router';
import { ArrowUpRight, Plus } from 'lucide-react';
import { ApiError } from '@/api';
import { useRepository } from '@/api/queries';
import { paths } from '@/lib/paths';
import { Breadcrumb } from '@/components/layout/breadcrumb';
import { Container, PageHeader } from '@/components/layout/container';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/common/states';
import { BountyBrowser } from '@/components/bounty/bounty-browser';
import { NotFoundPage } from '@/pages/not-found-page';
import { ActivityFeed } from './activity-feed';
import { StatCards, StatCardsSkeleton } from './stat-cards';

/** One repository: its totals, its bounties, and a new-bounty form with the repository already chosen. */
export function RepoDashboardPage() {
  const { repo = '' } = useParams();
  const repository = useRepository(repo);

  if (repository.error instanceof ApiError && repository.error.status === 404) return <NotFoundPage />;

  const newBounty = (
    <Button asChild variant="primary">
      <Link to={paths.newBounty(repo)}>
        <Plus />
        New bounty
      </Link>
    </Button>
  );
  const r = repository.data;

  return (
    <Container>
      <Breadcrumb items={[{ label: 'Dashboard', to: '/dashboard' }, { label: repo, mono: true }]} />
      <PageHeader
        className="pt-5 sm:pt-6"
        title={<span className="data">{repo}</span>}
        description={
          r ? (
            <>
              {r.description ?? 'No description.'}{' '}
              <a
                href={r.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-0.5 text-fg-muted underline-offset-4 hover:text-fg hover:underline"
              >
                View on GitHub
                <ArrowUpRight className="size-3.5" aria-hidden />
              </a>
            </>
          ) : (
            <span aria-hidden className="inline-block h-4 w-72 max-w-full animate-pulse rounded-sm bg-surface-2 align-middle" />
          )
        }
        actions={newBounty}
      />

      {repository.isPending ? (
        <StatCardsSkeleton />
      ) : repository.error ? (
        <ErrorState error={repository.error} onRetry={() => void repository.refetch()} />
      ) : (
        <StatCards stats={repository.data.stats} openHint="Waiting for a pull request or a merge" />
      )}

      <div className="mt-10 grid grid-cols-[minmax(0,1fr)] gap-10 lg:grid-cols-[minmax(0,1fr)_300px]">
        <section aria-labelledby="bounties-title">
          <h2 id="bounties-title" className="mb-4 text-[17px] font-semibold tracking-[-0.01em]">
            Bounties
          </h2>
          {repository.isPending ? (
            <Skeleton className="h-64 rounded-lg" />
          ) : (
            <BountyBrowser
              repo={repo}
              emptyTitle={`No bounties in ${repo} yet. Post one to open an issue there with a locked reward.`}
              emptyAction={newBounty}
            />
          )}
        </section>
        <section aria-labelledby="activity-title">
          <h2 id="activity-title" className="mb-4 text-[17px] font-semibold tracking-[-0.01em]">
            Activity
          </h2>
          <ActivityFeed repo={repo} />
        </section>
      </div>
    </Container>
  );
}
