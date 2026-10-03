import { Link } from 'react-router';
import { Button } from '@/components/ui/button';
import { Container } from '@/components/layout/container';

export function NotFoundPage() {
  return (
    <Container className="py-24 sm:py-32">
      <p className="label">404</p>
      <h1 className="mt-3 text-title font-semibold">There is nothing at this address.</h1>
      <p className="mt-2 text-body text-fg-muted">The link may be mistyped, or the bounty was removed.</p>
      <div className="mt-8 flex gap-2">
        <Button asChild variant="primary">
          <Link to="/bounties">Browse bounties</Link>
        </Button>
        <Button asChild>
          <Link to="/">Home</Link>
        </Button>
      </div>
    </Container>
  );
}
