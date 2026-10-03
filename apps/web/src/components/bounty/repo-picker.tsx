import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import type { RepositorySummary } from '@escrow/shared';
import { Search } from 'lucide-react';
import { matchRepos } from '@/lib/repo-filter';
import { cn } from '@/lib/cn';
import { Amount } from '@/components/common/amount';
import { PrivateBadge } from './private-badge';

type RepoPickerProps = {
  repos: RepositorySummary[];
  onSelect: (repo: string) => void;
};

/** Searchable list of repositories. The input keeps focus and arrow keys move the highlighted option. */
export function RepoPicker({ repos, onSelect }: RepoPickerProps) {
  const id = useId();
  const listRef = useRef<HTMLUListElement>(null);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);

  const shown = matchRepos(repos, query);
  const current = Math.min(active, shown.length - 1);

  useEffect(() => {
    listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [current, shown.length]);

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (shown.length === 0) return;
    if (event.key === 'ArrowDown') setActive((current + 1) % shown.length);
    else if (event.key === 'ArrowUp') setActive((current - 1 + shown.length) % shown.length);
    else if (event.key === 'Home') setActive(0);
    else if (event.key === 'End') setActive(shown.length - 1);
    else if (event.key === 'Enter') onSelect(shown[current]!.name);
    else return;
    event.preventDefault();
  };

  return (
    <div>
      <div className="relative p-1">
        <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-fg-subtle" aria-hidden />
        <input
          type="search"
          role="combobox"
          aria-expanded
          aria-controls={`${id}-list`}
          aria-activedescendant={shown.length > 0 ? `${id}-${current}` : undefined}
          aria-label="Find repository"
          placeholder="Find repository"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
          onKeyDown={onKeyDown}
          className="h-9 w-full rounded-sm border bg-bg pr-3 pl-9 text-ui text-fg placeholder:text-fg-subtle focus-visible:border-brand focus-visible:ring-3 focus-visible:ring-brand/20 focus-visible:outline-none"
        />
      </div>

      {shown.length === 0 ? (
        <p className="px-3 py-4 text-ui text-fg-subtle">No repository matches “{query.trim()}”.</p>
      ) : (
        <ul id={`${id}-list`} ref={listRef} role="listbox" aria-label="Repositories" className="max-h-64 overflow-y-auto">
          {shown.map((repo, i) => {
            const locked = BigInt(repo.stats.locked.amount) > 0n;
            return (
              <li
                key={repo.name}
                id={`${id}-${i}`}
                role="option"
                aria-selected={i === current}
                onClick={() => onSelect(repo.name)}
                onMouseMove={() => setActive(i)}
                className={cn(
                  'flex cursor-pointer items-center gap-2 rounded-sm px-2.5 py-2 text-ui text-fg-muted select-none',
                  i === current && 'bg-surface-2 text-fg',
                )}
              >
                <span className="data min-w-0 truncate text-fg">{repo.name}</span>
                {repo.isPrivate && <PrivateBadge />}
                <span className="data ml-auto text-[12px] text-fg-subtle">
                  {repo.stats.openCount}
                  <span className="sr-only"> open bounties</span>
                </span>
                <span className="min-w-20 text-right text-[13px]">
                  {locked ? <Amount value={repo.stats.locked} /> : <span className="text-fg-subtle">—</span>}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
