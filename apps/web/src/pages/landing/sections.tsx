import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { ArrowRight } from 'lucide-react';
import { useOrganization, useStats } from '@/api/queries';
import { Container } from '@/components/layout/container';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Amount } from '@/components/common/amount';
import { ErrorState } from '@/components/common/states';
import { FlowRibbon } from './flow-ribbon';

function SectionHeading({ eyebrow, title, children }: { eyebrow: string; title: string; children?: ReactNode }) {
  return (
    <div className="max-w-2xl">
      <p className="label">{eyebrow}</p>
      <h2 className="mt-4 text-[26px] font-semibold tracking-[-0.02em] sm:text-title">{title}</h2>
      {children && <p className="mt-3 text-body text-fg-muted">{children}</p>}
    </div>
  );
}

const MECHANICS = [
  {
    title: 'Locked before work starts',
    body: 'The reward is locked when the bounty is posted. Developers can check it is there before writing a line.',
  },
  {
    title: 'Checked on every commit',
    body: 'Each push is reviewed by two AI models and the test suite. The result appears on the pull request as a GitHub check.',
  },
  {
    title: 'Released on merge',
    body: 'The maintainer merges when they decide to. That merge is what releases the reward to the author.',
  },
];

export function HowItWorks() {
  return (
    <section id="how-it-works" className="scroll-mt-14 border-b py-20 sm:py-28">
      <Container>
        <SectionHeading eyebrow="How it works" title="From issue to payout">
          Nothing new to learn: issues, pull requests and checks work the way they already do on GitHub.
        </SectionHeading>
        <div className="mt-14">
          <FlowRibbon />
        </div>
        <div className="mt-16 grid gap-8 border-t pt-10 md:grid-cols-3">
          {MECHANICS.map((m) => (
            <div key={m.title}>
              <h3 className="font-semibold text-fg">{m.title}</h3>
              <p className="mt-2 text-body text-fg-muted">{m.body}</p>
            </div>
          ))}
        </div>
      </Container>
    </section>
  );
}

export function TrustStatement() {
  return (
    <section className="border-b py-20 sm:py-28">
      <Container className="grid gap-8 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] lg:gap-16">
        <p className="text-[28px] leading-[1.2] font-semibold tracking-[-0.02em] text-balance sm:text-[36px]">
          The party that holds the money does not decide who gets it.
        </p>
        <div className="space-y-4 text-body text-fg-muted lg:pt-2">
          <p>
            Release conditions are enforced by an on-chain program, not by OpenMerge&apos;s servers. Our backend can read the
            state of a bounty. It cannot move the reward.
          </p>
          <p>Every lock and every payout is a transaction with a signature anyone can look up.</p>
        </div>
      </Container>
    </section>
  );
}

type Role = { eyebrow: string; title: string; steps: string[]; cta: ReactNode };

function RoleCard({ eyebrow, title, steps, cta }: Role) {
  return (
    <div className="flex flex-col rounded-lg border bg-surface-1 p-6 sm:p-8">
      <p className="label">{eyebrow}</p>
      <h3 className="mt-3 text-section font-semibold">{title}</h3>
      <ol className="mt-6 flex-1 space-y-4">
        {steps.map((step, i) => (
          <li key={step} className="grid grid-cols-[24px_minmax(0,1fr)] gap-3 text-body text-fg-muted">
            <span className="data flex size-6 items-center justify-center rounded-sm border bg-bg text-[12px] text-fg-subtle">
              {i + 1}
            </span>
            {step}
          </li>
        ))}
      </ol>
      <div className="mt-8">{cta}</div>
    </div>
  );
}

export function Roles() {
  return (
    <section className="border-b py-20 sm:py-28">
      <Container>
        <SectionHeading eyebrow="Two sides" title="Each side does what it already does" />
        <div className="mt-12 grid gap-4 md:grid-cols-2">
          <RoleCard
            eyebrow="Maintainers"
            title="Get issues solved"
            steps={[
              'Post a bounty. The issue opens on GitHub and the reward is locked.',
              'Review pull requests with the AI check alongside your CI.',
              'Merge the one you want. Payment goes out on merge.',
            ]}
            cta={
              <Button asChild variant="primary">
                <Link to="/dashboard/new">Post a bounty</Link>
              </Button>
            }
          />
          <RoleCard
            eyebrow="Developers"
            title="Get paid for pull requests"
            steps={[
              'Sign in with GitHub and link a Phantom wallet.',
              'Pick a bounty and open a pull request that references the issue.',
              'When the maintainer merges, the reward arrives in your wallet.',
            ]}
            cta={
              <Button asChild>
                <Link to="/bounties">
                  Browse bounties
                  <ArrowRight />
                </Link>
              </Button>
            }
          />
        </div>
      </Container>
    </section>
  );
}

function Figure({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="border-t pt-5">
      <p className="label">{label}</p>
      <div className="mt-3 text-[30px] leading-none font-medium tracking-[-0.02em]">{children}</div>
    </div>
  );
}

export function LiveNumbers() {
  const stats = useStats();
  const organization = useOrganization();
  const org = organization.data?.login ?? 'the organization';

  return (
    <section className="py-20 sm:py-28">
      <Container>
        <SectionHeading eyebrow="Live" title="Numbers from the organization">
          Every bounty across the <span className="data text-fg">{org}</span> repositories, read from the same API the app
          uses.
        </SectionHeading>
        {stats.isPending ? (
          <div className="mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-4" aria-busy>
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-[76px]" />
            ))}
          </div>
        ) : stats.error ? (
          <ErrorState className="mt-12" error={stats.error} onRetry={() => void stats.refetch()} />
        ) : (
          <div className="mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            <Figure label="Locked in escrow">
              <Amount value={stats.data.locked} animate large />
            </Figure>
            <Figure label="Paid out">
              <Amount value={stats.data.paid} animate large />
            </Figure>
            <Figure label="Open bounties">
              <span className="data">{stats.data.openCount}</span>
            </Figure>
            <Figure label="Contributors">
              <span className="data">{stats.data.contributorCount}</span>
            </Figure>
          </div>
        )}
        <div className="mt-16 flex flex-col gap-6 rounded-lg border bg-surface-1 p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8">
          <div>
            <p className="text-section font-semibold">Pick an issue. Open a pull request.</p>
            <p className="mt-1.5 text-body text-fg-muted">Merge to release payment.</p>
          </div>
          <Button asChild variant="primary" size="lg">
            <Link to="/bounties">
              Browse bounties
              <ArrowRight />
            </Link>
          </Button>
        </div>
      </Container>
    </section>
  );
}
