import { Link, Navigate, Outlet, useLocation } from 'react-router';
import { ShieldAlert } from 'lucide-react';
import { useOrganization, useSession } from '@/api/queries';
import { useOwnerViewAction } from './session-actions';
import { Container } from '@/components/layout/container';
import { EmptyState, ErrorState } from '@/components/common/states';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

function PageSkeleton() {
  return (
    <Container className="pt-14" aria-busy>
      <Skeleton className="h-8 w-56" />
      <Skeleton className="mt-3 h-4 w-96 max-w-full" />
      <Skeleton className="mt-10 h-64 w-full rounded-lg" />
    </Container>
  );
}

/** Sends signed-out visitors to sign in, then back here. */
export function RequireAuth() {
  const session = useSession();
  const location = useLocation();

  if (session.isPending) return <PageSkeleton />;
  if (session.error) {
    return (
      <Container className="pt-14">
        <ErrorState error={session.error} onRetry={() => void session.refetch()} />
      </Container>
    );
  }
  if (!session.data.user) {
    const next = encodeURIComponent(location.pathname + location.search + location.hash);
    return <Navigate to={`/sign-in?next=${next}`} replace />;
  }
  return <Outlet />;
}

export function RequireMaintainer() {
  const session = useSession();
  const organization = useOrganization();
  const owner = useOwnerViewAction();
  if (session.data?.user?.role === 'maintainer') return <Outlet />;

  const org = organization.data?.login ?? 'this organization';
  return (
    <Container className="pt-14">
      <EmptyState
        icon={ShieldAlert}
        title={`This page belongs to the owner of ${org}. Open the owner view to manage bounties.`}
        action={
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="primary" onClick={() => owner.open()} pending={owner.pending}>
              Open owner view
            </Button>
            <Button asChild size="sm">
              <Link to="/bounties">Browse bounties</Link>
            </Button>
          </div>
        }
      />
    </Container>
  );
}
