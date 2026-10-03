import { useState } from 'react';
import type { User } from '@escrow/shared';
import { ArrowUpRight, Check, Wallet } from 'lucide-react';
import { addressUrl } from '@/lib/explorer';
import { cn } from '@/lib/cn';
import { PHANTOM_DOWNLOAD_URL } from '@/wallet/phantom';
import { usePhantom } from '@/wallet/use-phantom';
import { type LinkStage, useLinkWallet } from '@/wallet/use-link-wallet';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { CopyButton } from '@/components/common/copy-button';
import { RelativeTime } from '@/components/common/relative-time';
import { UnlinkWalletDialog } from '@/components/wallet/unlink-wallet-dialog';
import { WalletBalancePanel } from '@/components/wallet/wallet-balance';

const STAGES: { key: Exclude<LinkStage, 'idle'>; label: string }[] = [
  { key: 'connecting', label: 'Approve the connection in Phantom' },
  { key: 'signing', label: 'Sign the message in Phantom' },
  { key: 'saving', label: 'Save the wallet to your account' },
];

const STAGE_BUTTON: Record<LinkStage, string> = {
  idle: 'Connect Phantom',
  connecting: 'Waiting for Phantom…',
  signing: 'Waiting for signature…',
  saving: 'Linking…',
};

function StageList({ stage }: { stage: LinkStage }) {
  const current = STAGES.findIndex((s) => s.key === stage);
  return (
    <ol className="mt-5 space-y-2 text-[13px]" aria-live="polite">
      {STAGES.map((s, i) => (
        <li key={s.key} className={cn('flex items-center gap-2.5', i <= current ? 'text-fg' : 'text-fg-subtle')}>
          <span
            className={cn(
              'flex size-[18px] items-center justify-center rounded-full border text-[10px]',
              i < current && 'border-ok/40 bg-ok/12 text-ok',
              i === current && 'border-brand/60 text-brand',
            )}
          >
            {i < current ? <Check className="size-3" strokeWidth={3} /> : <span className="data">{i + 1}</span>}
          </span>
          {s.label}
        </li>
      ))}
    </ol>
  );
}

function UnlinkButton() {
  const [open, setOpen] = useState(false);
  return (
    <UnlinkWalletDialog
      open={open}
      onOpenChange={setOpen}
      trigger={
        <Button variant="ghost" size="sm">
          Unlink
        </Button>
      }
    />
  );
}

/** Link a Phantom wallet by signing a challenge, or show the linked one. */
export function WalletSection({ user }: { user: User }) {
  const { provider, checked } = usePhantom();
  const [stage, setStage] = useState<LinkStage>('idle');
  const link = useLinkWallet(setStage);
  const busy = link.isPending;

  if (user.wallet && !busy) {
    return (
      <div>
        <div className="rounded-md border bg-bg">
          <div className="flex items-center gap-3 px-4 py-3">
            <span className="size-1.5 shrink-0 rounded-full bg-ok" aria-hidden />
            <span className="data min-w-0 flex-1 truncate text-[13px] text-fg sm:text-ui">{user.wallet.address}</span>
            <CopyButton value={user.wallet.address} label="wallet address" />
            <a
              href={addressUrl(user.wallet.address)}
              target="_blank"
              rel="noreferrer"
              aria-label="Open wallet in explorer"
              className="inline-flex size-6 items-center justify-center rounded-sm text-fg-subtle transition-colors duration-120 hover:bg-surface-2 hover:text-fg"
            >
              <ArrowUpRight className="size-3.5" />
            </a>
          </div>
          <WalletBalancePanel address={user.wallet.address} />
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-[13px] text-fg-subtle">
            Linked <RelativeTime iso={user.wallet.linkedAt} /> with Phantom
          </p>
          <div className="flex gap-1">
            {provider && (
              <Button variant="ghost" size="sm" onClick={() => link.mutate()}>
                Replace
              </Button>
            )}
            <UnlinkButton />
          </div>
        </div>
      </div>
    );
  }

  if (!checked) return <Skeleton className="h-9 w-44" />;

  if (!provider) {
    return (
      <div className="space-y-3">
        <p className="text-ui text-fg-muted">Phantom is not installed in this browser. Install it, then reload this page.</p>
        <Button asChild variant="primary">
          <a href={PHANTOM_DOWNLOAD_URL} target="_blank" rel="noreferrer">
            <Wallet />
            Install Phantom
            <ArrowUpRight className="text-bg/60" />
          </a>
        </Button>
      </div>
    );
  }

  return (
    <div>
      <Button variant="primary" onClick={() => link.mutate()} pending={busy}>
        {!busy && <Wallet />}
        {STAGE_BUTTON[stage]}
      </Button>
      {busy ? (
        <StageList stage={stage} />
      ) : (
        link.error && (
          <p role="alert" className="mt-3 text-[13px] text-danger">
            {link.error.message}
          </p>
        )
      )}
    </div>
  );
}
