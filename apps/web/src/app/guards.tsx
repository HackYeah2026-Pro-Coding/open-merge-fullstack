import { Link, Navigate, Outlet, useLocation } from 'react-router';
import { ShieldAlert } from 'lucide-react';
import { useProject, useSession } from '@/api/queries';
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
  const project = useProject();
  if (session.data?.user?.role === 'maintainer') return <Outlet />;

  const repo = project.data ? `${project.data.owner}/${project.data.repo}` : 'this repository';
  return (
    <Container className="pt-14">
      <EmptyState
        icon={ShieldAlert}
        title={`This page is for the maintainer of ${repo}. Open bounties are listed for everyone.`}
        action={
          <Button asChild size="sm">
            <Link to="/bounties">Browse bounties</Link>
          </Button>
        }
      />
    </Container>
  );
}
