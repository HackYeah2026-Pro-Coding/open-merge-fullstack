import { useEffect, useId, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router';
import type { BountyStatus } from '@escrow/shared';
import { Inbox, Search, SearchX } from 'lucide-react';
import { useBounties } from '@/api/queries';
import { readFilters, writeFilters } from '@/lib/bounty-filters';
import { cn } from '@/lib/cn';
import { useDebouncedValue } from '@/lib/use-debounced-value';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectItemText, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState } from '@/components/common/states';
import { BountyRow, BountyRowSkeleton } from './bounty-row';
import { RepoFilter } from './repo-filter';
import { BOUNTY_STATUS, BOUNTY_STATUS_ORDER } from './status';

type BountyBrowserProps = {
  /** Limits the list to one repository and hides the repository filter. */
  repo?: string;
  /** Shown when there are no bounties at all, as opposed to none matching a filter. */
  emptyAction?: ReactNode;
  emptyTitle: string;
};

/** Searchable, filterable bounty list. Every filter is mirrored in the URL. */
export function BountyBrowser({ repo: scope, emptyAction, emptyTitle }: BountyBrowserProps) {
  const sortId = useId();
  const [params, setParams] = useSearchParams();
  const filters = readFilters(params);
  const [search, setSearch] = useState(filters.q);
  const debouncedSearch = useDebouncedValue(search);

  useEffect(() => {
    if (debouncedSearch !== readFilters(params).q) {
      setParams((prev) => writeFilters(prev, { q: debouncedSearch }), { replace: true });
    }
  }, [debouncedSearch, params, setParams]);

  const repo = scope ?? filters.repo;
  const all = useBounties({ repo });
  const list = useBounties({ repo, status: filters.status, q: filters.q, sort: filters.sort });
  const counts = new Map<BountyStatus, number>();
  for (const b of all.data ?? []) counts.set(b.status, (counts.get(b.status) ?? 0) + 1);

  const filtered = !!filters.status || !!filters.q || (!scope && !!filters.repo);
  const clear = () => {
    setSearch('');
    setParams((prev) => writeFilters(prev, { status: undefined, q: '', ...(scope ? {} : { repo: undefined }) }));
  };

  const tab = (status: BountyStatus | undefined, label: string, count: number | undefined) => {
    const active = filters.status === status;
    return (
      <Link
        key={label}
        to={{ search: writeFilters(params, { status }).toString() }}
        aria-current={active ? 'page' : undefined}
        className={cn(
          'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-sm px-2.5 text-[13px] font-medium transition-colors duration-120',
          active ? 'bg-surface-2 text-fg' : 'text-fg-subtle hover:text-fg',
        )}
      >
        {label}
        {count !== undefined && <span className="data text-[12px] text-fg-subtle">{count}</span>}
      </Link>
    );
  };

  return (
    <div>
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative sm:max-w-xs sm:flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-fg-subtle" aria-hidden />
          <Input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search title or #number"
            aria-label="Search bounties"
            className="pl-9"
          />
        </div>
        <div className="flex items-center gap-2 text-[13px] text-fg-subtle sm:ml-auto">
          <span id={`${sortId}-label`}>Sort</span>
          <Select
            value={filters.sort}
            onValueChange={(next) => setParams((prev) => writeFilters(prev, { sort: next === 'reward' ? 'reward' : 'newest' }))}
          >
            <SelectTrigger aria-labelledby={`${sortId}-label`} className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="end">
              <SelectItem value="newest">
                <SelectItemText>Newest</SelectItemText>
              </SelectItem>
              <SelectItem value="reward">
                <SelectItemText>Highest reward</SelectItemText>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {!scope && (
        <RepoFilter
          value={filters.repo}
          onChange={(next) => setParams((prev) => writeFilters(prev, { repo: next }))}
        />
      )}

      <div className="overflow-hidden rounded-lg border">
        <nav aria-label="Filter by status" className="flex gap-1 overflow-x-auto border-b bg-surface-1 px-2 py-2 sm:px-3">
          {tab(undefined, 'All', all.data?.length)}
          {BOUNTY_STATUS_ORDER.map((s) => tab(s, BOUNTY_STATUS[s].label, counts.get(s) ?? (all.data ? 0 : undefined)))}
        </nav>

        {list.isPending ? (
          <ul aria-busy className="divide-y">
            {Array.from({ length: 5 }, (_, i) => (
              <BountyRowSkeleton key={i} />
            ))}
          </ul>
        ) : list.error ? (
          <div className="p-4">
            <ErrorState error={list.error} onRetry={() => void list.refetch()} />
          </div>
        ) : list.data.length === 0 ? (
          <div className="p-4">
            {filtered ? (
              <EmptyState
                icon={SearchX}
                title="No bounties match these filters."
                action={
                  <Button size="sm" onClick={clear}>
                    Clear filters
                  </Button>
                }
                className="border-0"
              />
            ) : (
              <EmptyState icon={Inbox} title={emptyTitle} action={emptyAction} className="border-0" />
            )}
          </div>
        ) : (
          <ul className={cn('divide-y transition-opacity duration-180', list.isPlaceholderData && 'opacity-60')}>
            {list.data.map((b) => (
              <BountyRow key={b.id} bounty={b} showRepo={!scope} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
