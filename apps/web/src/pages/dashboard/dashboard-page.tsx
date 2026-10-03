import { Link } from 'react-router';
import { Plus } from 'lucide-react';
import { useOrganization, useStats } from '@/api/queries';
import { pluralize } from '@/lib/format';
import { paths } from '@/lib/paths';
import { Container, PageHeader } from '@/components/layout/container';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { ErrorState } from '@/components/common/states';
import { ActivityFeed } from './activity-feed';
import { RepositoryList } from './repository-list';
import { StatCards, StatCardsSkeleton } from './stat-cards';

function OrganizationStats() {
  const stats = useStats();
  if (stats.isPending) return <StatCardsSkeleton />;
  if (stats.error) return <ErrorState error={stats.error} onRetry={() => void stats.refetch()} />;
  const s = stats.data;
  return (
    <StatCards
      stats={s}
      openHint={`Across ${pluralize(s.repositoryCount, 'repository', 'repositories')}, ${pluralize(s.contributorCount, 'developer')} submitting`}
    />
  );
}

/** The owner's home: every repository of the organization, its totals and what just happened. */
export function DashboardPage() {
  const organization = useOrganization();
  const org = organization.data;

  return (
    <Container>
      <PageHeader
        eyebrow={
          org ? (
            <span className="inline-flex items-center gap-2 normal-case tracking-normal">
              <Avatar login={org.login} src={org.avatarUrl} size={18} />
              <span className="data">{org.login}</span>
            </span>
          ) : (
            'Organization'
          )
        }
        title="Dashboard"
        description="Bounties across every repository in the organization. Rewards are locked when you post them and released when you merge."
        actions={
          <Button asChild variant="primary">
            <Link to={paths.newBounty()}>
              <Plus />
              New bounty
            </Link>
          </Button>
        }
      />
      <OrganizationStats />
      <div className="mt-10 grid grid-cols-[minmax(0,1fr)] gap-10 lg:grid-cols-[minmax(0,1fr)_300px]">
        <section aria-labelledby="repositories-title">
          <h2 id="repositories-title" className="mb-4 text-[17px] font-semibold tracking-[-0.01em]">
            Repositories
          </h2>
          <RepositoryList />
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
