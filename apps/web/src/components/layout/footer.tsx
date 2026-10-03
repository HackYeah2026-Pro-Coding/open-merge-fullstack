import { Link } from 'react-router';
import { useOrganization } from '@/api/queries';
import { Container } from './container';
import { Logo } from './top-bar';

export function Footer() {
  const organization = useOrganization();
  return (
    <footer className="mt-24 border-t">
      <Container className="flex flex-col gap-6 py-10 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-2">
          <Logo />
          <p className="text-[13px] text-fg-subtle">Paid bounties for open-source issues. Merge to release payment.</p>
        </div>
        <nav aria-label="Footer" className="flex flex-wrap gap-x-6 gap-y-2 text-[13px] text-fg-muted">
          <Link to="/bounties" className="hover:text-fg">
            Bounties
          </Link>
          <Link to="/#how-it-works" className="hover:text-fg">
            How it works
          </Link>
          {organization.data && (
            <a href={organization.data.url} target="_blank" rel="noreferrer" className="data hover:text-fg">
              {organization.data.login}
            </a>
          )}
        </nav>
      </Container>
    </footer>
  );
}
