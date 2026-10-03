import { Fragment } from 'react';
import { Link } from 'react-router';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/cn';

export type Crumb = { label: string; to?: string; mono?: boolean };

/** Path to the current page; the last crumb is the page itself. */
export function Breadcrumb({ items, className }: { items: Crumb[]; className?: string }) {
  return (
    <nav aria-label="Breadcrumb" className={cn('flex flex-wrap items-center gap-1.5 pt-8 text-[13px] text-fg-subtle sm:pt-10', className)}>
      {items.map((item, i) => {
        const last = i === items.length - 1;
        return (
          <Fragment key={`${item.label}-${i}`}>
            {i > 0 && <ChevronRight className="size-3.5" aria-hidden />}
            {item.to && !last ? (
              <Link to={item.to} className={cn('hover:text-fg', item.mono && 'data')}>
                {item.label}
              </Link>
            ) : (
              <span className={cn('text-fg-muted', item.mono && 'data')} aria-current={last ? 'page' : undefined}>
                {item.label}
              </span>
            )}
          </Fragment>
        );
      })}
    </nav>
  );
}
