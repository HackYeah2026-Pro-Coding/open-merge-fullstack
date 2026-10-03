import { useState, type ReactNode } from 'react';
import type { RepositorySummary } from '@escrow/shared';
import { ChevronDown, RotateCw } from 'lucide-react';
import { useRepositories } from '@/api/queries';
import { cn } from '@/lib/cn';
import { hasBounties, splitRepos } from '@/lib/repo-filter';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Skeleton } from '@/components/ui/skeleton';
import { RepoPicker } from './repo-picker';

const CHIP =
  'inline-flex h-8 shrink-0 cursor-pointer items-center gap-2 rounded-sm border px-3 text-[13px] transition-colors duration-120 focus-visible:ring-3 focus-visible:ring-brand/20 focus-visible:outline-none';

type ChipProps = { active: boolean; dim?: boolean; onClick: () => void; children: ReactNode };

function Chip({ active, dim, onClick, children }: ChipProps) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        CHIP,
        active ? 'border-brand/60 bg-brand/10 text-fg' : 'text-fg-muted hover:border-fg-subtle/60 hover:text-fg',
        dim && !active && 'opacity-60',
      )}
    >
      {children}
    </button>
  );
}

function Count({ value }: { value: number }) {
  return (
    <span className="data text-[12px] text-fg-subtle">
      {value}
      <span className="sr-only"> open bounties</span>
    </span>
  );
}

type RepoFilterProps = {
  /** Repository name, or undefined for every repository. */
  value: string | undefined;
  onChange: (repo: string | undefined) => void;
};

/** Repositories as a row of chips with open-bounty counts; the ones that do not fit move into a searchable picker. */
export function RepoFilter({ value, onChange }: RepoFilterProps) {
  const repos = useRepositories();
  const [pickerOpen, setPickerOpen] = useState(false);

  if (repos.isPending) {
    return (
      <div aria-busy className="mb-3 flex gap-2">
        {['w-14', 'w-28', 'w-24', 'w-28'].map((width, i) => (
          <Skeleton key={i} className={cn('h-8', width)} />
        ))}
      </div>
    );
  }

  if (repos.error) {
    return (
      <div role="alert" className="mb-3 flex items-center gap-3 text-[13px] text-fg-muted">
        <span>Could not load repositories. {repos.error.message}</span>
        <Button size="sm" variant="ghost" onClick={() => void repos.refetch()}>
          <RotateCw />
          Try again
        </Button>
      </div>
    );
  }

  const list: RepositorySummary[] = repos.data;
  // Nothing to filter by, unless a shared link already carries a repository.
  if (list.length < 2 && !value) return null;

  const { visible, overflow } = splitRepos(list, value);
  const unknown = value && !list.some((r) => r.name === value) ? value : undefined;
  const totalOpen = list.reduce((sum, r) => sum + r.stats.openCount, 0);

  return (
    <nav aria-label="Filter by repository" className="-m-1 mb-3 flex gap-2 overflow-x-auto p-1">
      <Chip active={!value} onClick={() => onChange(undefined)}>
        All
        <Count value={totalOpen} />
      </Chip>
      {unknown && (
        <Chip active onClick={() => onChange(unknown)}>
          <span className="data">{unknown}</span>
        </Chip>
      )}
      {visible.map((repo) => (
        <Chip key={repo.name} active={repo.name === value} dim={!hasBounties(repo)} onClick={() => onChange(repo.name)}>
          <span className="data">{repo.name}</span>
          <Count value={repo.stats.openCount} />
        </Chip>
      ))}
      {overflow.length > 0 && (
        <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
          <PopoverTrigger asChild>
            <button type="button" className={cn(CHIP, 'border-dashed text-fg-muted hover:border-fg-subtle/60 hover:text-fg')}>
              {overflow.length} more
              <ChevronDown className="size-4 text-fg-subtle" aria-hidden />
            </button>
          </PopoverTrigger>
          <PopoverContent>
            <RepoPicker
              repos={overflow}
              onSelect={(name) => {
                onChange(name);
                setPickerOpen(false);
              }}
            />
          </PopoverContent>
        </Popover>
      )}
    </nav>
  );
}
