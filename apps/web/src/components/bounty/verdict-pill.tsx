import type { CommitCheck, ReviewVerdict } from '@escrow/shared';
import { Check, Minus, X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Tooltip } from '@/components/ui/tooltip';

const VERDICT: Record<ReviewVerdict, { label: string; className: string }> = {
  approve: { label: 'Approves', className: 'bg-ok/12 text-ok-text' },
  changes: { label: 'Requests changes', className: 'bg-danger/12 text-danger' },
  pending: { label: 'Reviewing', className: 'bg-warn/10 text-warn' },
  error: { label: 'No answer', className: 'bg-surface-2 text-fg-muted' },
};

function VerdictIcon({ verdict }: { verdict: ReviewVerdict }) {
  if (verdict === 'approve') return <Check className="size-3" strokeWidth={2.75} />;
  if (verdict === 'changes') return <X className="size-3" strokeWidth={2.75} />;
  if (verdict === 'error') return <Minus className="size-3" strokeWidth={2.75} />;
  return <span className="size-1.5 animate-pulse rounded-full bg-current" />;
}

/**
 * One pill split in two, one half per AI reviewer. Same colour on both halves
 * means the reviewers agree; different colours means they disagree.
 */
export function VerdictPill({ check, className }: { check: CommitCheck; className?: string }) {
  if (check.state === 'not_run' || check.reviewers.length === 0) {
    return <span className={cn('text-[12px] text-fg-subtle', className)}>No check yet</span>;
  }

  const summary = check.reviewers.map((r) => `${r.reviewer}: ${VERDICT[r.verdict].label.toLowerCase()}`).join(', ');
  return (
    <span
      role="group"
      aria-label={`Review: ${summary}`}
      className={cn('inline-flex h-[22px] shrink-0 overflow-hidden rounded-full border text-[11.5px] font-medium', className)}
    >
      {check.reviewers.map((r, i) => (
        <Tooltip
          key={r.reviewer}
          content={
            <span className="block">
              <span className="font-medium">
                {r.reviewer} · {VERDICT[r.verdict].label}
              </span>
              {r.summary && <span className="mt-0.5 block text-fg-muted">{r.summary}</span>}
            </span>
          }
        >
          <span
            tabIndex={0}
            className={cn(
              'flex items-center gap-1 px-2 outline-offset-[-2px]',
              VERDICT[r.verdict].className,
              i > 0 && 'border-l border-l-border',
            )}
          >
            <VerdictIcon verdict={r.verdict} />
            {r.reviewer}
          </span>
        </Tooltip>
      ))}
    </span>
  );
}
