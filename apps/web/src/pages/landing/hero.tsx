import { Link } from 'react-router';
import { ArrowRight } from 'lucide-react';
import { useStats } from '@/api/queries';
import { formatAmount } from '@/lib/format';
import { Container } from '@/components/layout/container';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ProductPreview } from './product-preview';

function LiveLine() {
  const stats = useStats();
  if (stats.isPending) return <Skeleton className="mt-10 h-4 w-80 max-w-full" />;
  if (stats.error) return <p className="mt-10 text-[13px] text-fg-subtle">Live numbers are unavailable right now.</p>;
  const s = stats.data;
  return (
    <p className="mt-10 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-fg-subtle">
      <span className="inline-flex items-center gap-2">
        <span className="size-1.5 rounded-full bg-ok" aria-hidden />
        <span>
          <span className="data text-money-text">{formatAmount(s.locked)}</span> locked
        </span>
      </span>
      <span aria-hidden>·</span>
      <span>
        <span className="data text-money-text">{formatAmount(s.paid)}</span> paid out
      </span>
      <span aria-hidden>·</span>
      <span>
        <span className="data text-fg-muted">{s.openCount}</span> open bounties
      </span>
    </p>
  );
}

export function Hero() {
  return (
    <section className="border-b pt-14 pb-20 sm:pt-24 sm:pb-28">
      <Container className="grid items-center gap-14 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)] lg:gap-16">
        <div>
          <p className="label">Bounties for open-source issues</p>
          <h1 className="mt-5 text-[40px] leading-[1.05] font-semibold tracking-[-0.03em] text-balance sm:text-hero">
            Rewards locked up front. Released on merge.
          </h1>
          <p className="mt-6 max-w-xl text-[17px] leading-relaxed text-fg-muted">
            A maintainer attaches a reward to a GitHub issue and it is locked before anyone starts. A developer opens a pull
            request. When it is merged, the reward goes to the developer's wallet. Neither side has to trust the other.
          </p>
          <div className="mt-9 flex flex-wrap gap-3">
            <Button asChild variant="primary" size="lg">
              <Link to="/bounties">
                Browse bounties
                <ArrowRight />
              </Link>
            </Button>
            <Button asChild size="lg">
              <Link to="/dashboard/new">Post a bounty</Link>
            </Button>
          </div>
          <LiveLine />
        </div>
        <ProductPreview />
      </Container>
    </section>
  );
}
