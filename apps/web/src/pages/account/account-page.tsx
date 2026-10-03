import type { ReactNode } from 'react';
import { ArrowUpRight } from 'lucide-react';
import { useSession } from '@/api/queries';
import { Container, PageHeader } from '@/components/layout/container';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/bounty/status';
import { EarningsSection } from './earnings-section';
import { WalletSection } from './wallet-section';

function Section({ id, title, description, children }: { id?: string; title: string; description: ReactNode; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id ?? title}-title`} className="scroll-mt-24 grid gap-5 border-t py-8 md:grid-cols-[260px_minmax(0,1fr)] md:gap-10">
      <div>
        <h2 id={`${id ?? title}-title`} className="text-[15px] font-semibold">
          {title}
        </h2>
        <p className="mt-1.5 text-[13px] leading-relaxed text-fg-subtle">{description}</p>
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}

export function AccountPage() {
  const session = useSession();
  // RequireAuth guarantees a user here.
  const user = session.data?.user;
  if (!user) return null;

  return (
    <Container className="max-w-4xl">
      <PageHeader title="Account" description="Your GitHub identity and the wallet payouts are sent to." />

      <Section title="GitHub" description="Used to sign in and to match your pull requests to payouts.">
        <div className="flex items-center gap-4">
          <Avatar login={user.githubLogin} src={user.avatarUrl} size={44} />
          <div className="min-w-0 flex-1">
            <p className="flex flex-wrap items-center gap-2 font-medium text-fg">
              {user.name ?? user.githubLogin}
              <Badge tone="neutral">{user.role === 'maintainer' ? 'Project owner' : 'Developer'}</Badge>
            </p>
            <a
              href={`https://github.com/${user.githubLogin}`}
              target="_blank"
              rel="noreferrer"
              className="data mt-0.5 inline-flex items-center gap-0.5 text-[13px] text-fg-muted hover:text-fg"
            >
              @{user.githubLogin}
              <ArrowUpRight className="size-3.5" aria-hidden />
            </a>
          </div>
        </div>
      </Section>

      <Section
        id="wallet"
        title="Payout wallet"
        description="Rewards go to this Solana address when your pull request merges. Linking asks Phantom to sign a message; it is free and sends no transaction."
      >
        <WalletSection user={user} />
      </Section>

      {user.role === 'developer' && (
        <Section title="Earnings" description="Pull requests you opened against bounties, and what they paid.">
          <EarningsSection />
        </Section>
      )}
    </Container>
  );
}
