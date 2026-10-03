import type { ReactNode } from 'react';
import type { BountyStatus, PullRequestState } from '@escrow/shared';
import { CircleCheck, CircleDot, CircleSlash, Clock, GitMerge, GitPullRequest, GitPullRequestClosed, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/cn';

/** Status colours follow GitHub: green open, violet merged/paid, amber pending, red failed, grey closed. */
export type Tone = 'ok' | 'warn' | 'brand' | 'danger' | 'neutral';

export const toneText: Record<Tone, string> = {
  ok: 'text-ok-text',
  warn: 'text-warn',
  brand: 'text-brand',
  danger: 'text-danger',
  neutral: 'text-fg-subtle',
};

const toneBadge: Record<Tone, string> = {
  ok: 'border-ok/30 bg-ok/10 text-ok-text',
  warn: 'border-warn/30 bg-warn/10 text-warn',
  brand: 'border-brand/35 bg-brand/12 text-brand',
  danger: 'border-danger/30 bg-danger/10 text-danger',
  neutral: 'border-border bg-surface-2 text-fg-muted',
};

export const BOUNTY_STATUS: Record<BountyStatus, { label: string; tone: Tone; icon: LucideIcon }> = {
  open: { label: 'Open', tone: 'ok', icon: CircleDot },
  in_review: { label: 'In review', tone: 'warn', icon: CircleDot },
  payout_held: { label: 'Payout held', tone: 'warn', icon: Clock },
  paid: { label: 'Paid', tone: 'brand', icon: CircleCheck },
  closed: { label: 'Closed', tone: 'neutral', icon: CircleSlash },
};

export const BOUNTY_STATUS_ORDER: BountyStatus[] = ['open', 'in_review', 'payout_held', 'paid', 'closed'];

export const PR_STATE: Record<PullRequestState, { label: string; tone: Tone; icon: LucideIcon }> = {
  open: { label: 'Open', tone: 'ok', icon: GitPullRequest },
  merged: { label: 'Merged', tone: 'brand', icon: GitMerge },
  closed: { label: 'Closed', tone: 'danger', icon: GitPullRequestClosed },
};

export function Badge({ tone, children, className }: { tone: Tone; children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex h-[22px] shrink-0 items-center gap-1.5 rounded-full border px-2 text-[12px] font-medium whitespace-nowrap',
        toneBadge[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function StatusBadge({ status, className }: { status: BountyStatus; className?: string }) {
  const { label, tone } = BOUNTY_STATUS[status];
  return (
    <Badge tone={tone} className={className}>
      <span className="size-1.5 rounded-full bg-current" aria-hidden />
      {label}
    </Badge>
  );
}

export function StatusIcon({ status, className }: { status: BountyStatus; className?: string }) {
  const { icon: Icon, tone, label } = BOUNTY_STATUS[status];
  return <Icon className={cn('size-4 shrink-0', toneText[tone], className)} aria-label={label} role="img" />;
}
