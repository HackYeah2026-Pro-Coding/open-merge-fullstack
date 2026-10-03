import { formatExact, formatRelative } from '@/lib/format';
import { Tooltip } from '@/components/ui/tooltip';
import { cn } from '@/lib/cn';

/** "2h ago", with the exact time on hover and focus. */
export function RelativeTime({ iso, className }: { iso: string; className?: string }) {
  return (
    <Tooltip content={formatExact(iso)}>
      <time dateTime={iso} tabIndex={0} className={cn('whitespace-nowrap rounded-[3px] tabular-nums', className)}>
        {formatRelative(iso)}
      </time>
    </Tooltip>
  );
}
