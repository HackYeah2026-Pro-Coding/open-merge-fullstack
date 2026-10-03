import type { ReactNode } from 'react';
import { Link, useLocation } from 'react-router';
import type { Bounty, User } from '@escrow/shared';
import { ArrowUpRight, Check, Circle } from 'lucide-react';
import { addressUrl, txUrl } from '@/lib/explorer';
import { formatAmount, shortKey } from '@/lib/format';
import { cn } from '@/lib/cn';
import { Button } from '@/components/ui/button';
import { CopyButton } from '@/components/common/copy-button';
import { KeyValue } from '@/components/common/key-value';
import { GithubIcon } from '@/components/common/icons';

type Props = { bounty: Bounty; user: User | null };

function ChecklistItem({ done, children }: { done: boolean; children: ReactNode }) {
  return (
    <li className="flex items-center gap-2.5">
      <span
        className={cn(
          'flex size-[18px] shrink-0 items-center justify-center rounded-full border',
          done ? 'border-ok/40 bg-ok/12 text-ok' : 'border-dashed text-fg-subtle',
        )}
      >
        {done ? <Check className="size-3" strokeWidth={3} /> : <Circle className="size-1.5 fill-current" />}
      </span>
      <span className="min-w-0 flex-1">{children}</span>
    </li>
  );
}

function DeveloperSteps({ bounty, user }: { bounty: Bounty; user: User }) {
  const reference = `Closes #${bounty.issue.number}`;
  return (
    <div className="space-y-4">
      <ul className="space-y-2 text-ui">
        <ChecklistItem done>
          <span className="text-fg-muted">GitHub</span> <span className="data text-fg">@{user.githubLogin}</span>
        </ChecklistItem>
        <ChecklistItem done={!!user.wallet}>
          {user.wallet ? (
            <>
              <span className="text-fg-muted">Wallet</span> <span className="data text-fg">{shortKey(user.wallet.address)}</span>
            </>
          ) : (
            <span className="flex flex-wrap items-center justify-between gap-x-2">
              <span className="text-fg-muted">No wallet linked</span>
              <Link to="/account#wallet" className="text-[13px] font-medium text-brand hover:underline hover:underline-offset-4">
                Link wallet
              </Link>
            </span>
          )}
        </ChecklistItem>
      </ul>

      <div>
        <p className="text-[13px] text-fg-muted">Reference the issue in your pull request:</p>
        <div className="mt-2 flex items-center justify-between rounded-sm border bg-bg py-1 pr-1 pl-3">
          <code className="data text-[13px] text-fg">{reference}</code>
          <CopyButton value={reference} label="issue reference" />
        </div>
      </div>

      <Button asChild variant="primary" className="w-full">
        <a href={`${bounty.repository.url}/compare`} target="_blank" rel="noreferrer">
          <GithubIcon className="size-4" />
          Open a pull request
          <ArrowUpRight className="text-bg/60" />
        </a>
      </Button>
      <p className="text-[13px] text-fg-subtle">
        Checks run on every push. The merge sends {formatAmount(bounty.reward)} to your wallet.
      </p>
    </div>
  );
}

/** The panel footer: what this viewer can do next with this bounty. */
export function SubmitCard({ bounty, user }: Props) {
  const location = useLocation();
  const issueLink = (
    <Button asChild className="w-full">
      <a href={bounty.issue.url} target="_blank" rel="noreferrer">
        <GithubIcon className="size-4" />
        View issue on GitHub
      </a>
    </Button>
  );

  if (bounty.status === 'paid' && bounty.payout) {
    return (
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-4 gap-y-2 text-ui">
        <dt className="text-fg-subtle">Paid to</dt>
        <dd className="data text-fg">@{bounty.payout.recipient.login}</dd>
        {bounty.payout.wallet && (
          <>
            <dt className="text-fg-subtle">Wallet</dt>
            <dd>
              <KeyValue value={bounty.payout.wallet} label="wallet address" href={addressUrl(bounty.payout.wallet)} />
            </dd>
          </>
        )}
        {bounty.payout.txSignature && (
          <>
            <dt className="text-fg-subtle">Transaction</dt>
            <dd>
              <KeyValue value={bounty.payout.txSignature} label="transaction signature" href={txUrl(bounty.payout.txSignature)} />
            </dd>
          </>
        )}
      </dl>
    );
  }

  if (bounty.status === 'payout_held') {
    const mine = user && bounty.payout?.recipient.login === user.githubLogin;
    if (mine && !user.wallet) {
      return (
        <div className="space-y-4">
          <p className="text-ui text-fg-muted">
            Your pull request was merged. Link a wallet to receive {formatAmount(bounty.reward)}.
          </p>
          <Button asChild variant="primary" className="w-full">
            <Link to="/account#wallet">Link wallet</Link>
          </Button>
        </div>
      );
    }
    return <p className="text-ui text-fg-muted">The pull request is merged. The payout is held: {bounty.payout?.reason ?? 'waiting for a decision'}.</p>;
  }

  if (bounty.status === 'closed') {
    return <p className="text-ui text-fg-muted">This bounty is closed. The reward was returned to the maintainer.</p>;
  }

  if (!user) {
    return (
      <div className="space-y-4">
        <p className="text-ui text-fg-muted">Sign in with GitHub to work on this bounty. Payouts go to the wallet you link.</p>
        <Button asChild variant="primary" className="w-full">
          <Link to={`/sign-in?next=${encodeURIComponent(location.pathname)}`}>
            <GithubIcon className="size-4" />
            Sign in with GitHub
          </Link>
        </Button>
      </div>
    );
  }

  if (user.role === 'maintainer') {
    return (
      <div className="space-y-4">
        <p className="text-ui text-fg-muted">
          Developers submit by opening a pull request that references <span className="data text-fg">#{bounty.issue.number}</span>.
          Merge on GitHub to release the reward.
        </p>
        {issueLink}
      </div>
    );
  }

  return <DeveloperSteps bounty={bounty} user={user} />;
}
