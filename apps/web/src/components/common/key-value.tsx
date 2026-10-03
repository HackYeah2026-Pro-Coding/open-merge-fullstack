import { ExternalLink } from 'lucide-react';
import { shortKey } from '@/lib/format';
import { cn } from '@/lib/cn';
import { CopyButton } from './copy-button';

type KeyProps = {
  value: string;
  label: string;
  href?: string;
  edge?: number;
  /** Overrides the shortened form, e.g. a 7-character commit hash. */
  display?: string;
  className?: string;
};

/** A hash, address or signature: shortened in mono, with copy and an optional explorer link. */
export function KeyValue({ value, label, href, edge = 4, display, className }: KeyProps) {
  return (
    <span className={cn('inline-flex items-center gap-0.5', className)}>
      <span className="data text-[13px] text-fg-muted" title={value}>
        {display ?? shortKey(value, edge)}
      </span>
      <CopyButton value={value} label={label} />
      {href && (
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          aria-label={`Open ${label} in explorer`}
          className="inline-flex size-6 items-center justify-center rounded-sm text-fg-subtle transition-colors duration-120 hover:bg-surface-2 hover:text-fg"
        >
          <ExternalLink className="size-3.5" />
        </a>
      )}
    </span>
  );
}
