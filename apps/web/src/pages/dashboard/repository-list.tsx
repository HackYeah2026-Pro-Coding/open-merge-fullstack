import { Link, useSearchParams } from 'react-router';
import type { RepositorySummary } from '@escrow/shared';
import { BookMarked, ChevronRight, FolderGit2, Plus, Search, SearchX } from 'lucide-react';
import { useRepositories } from '@/api/queries';
import { cn } from '@/lib/cn';
import { formatExact, formatRelative, pluralize } from '@/lib/format';
import { paths } from '@/lib/paths';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Amount } from '@/components/common/amount';
import { EmptyState, ErrorState } from '@/components/common/states';
import { AddRepositoryDialog } from './add-repository-dialog';

/** Icon, repository, open bounties, locked reward, last activity, chevron: the desktop columns. */
const COLUMNS = 'sm:grid-cols-[16px_minmax(0,1fr)_88px_150px_96px_16px]';

function PrivateBadge() {
  return <span className="rounded-full border px-1.5 text-[11px] leading-[18px] text-fg-subtle">Private</span>;
}

function LastActivity({ at }: { at: string | null }) {
  if (!at) return <span className="text-fg-subtle">No activity</span>;
  return (
    <time dateTime={at} title={formatExact(at)}>
      {formatRelative(at)}
    </time>
  );
}

function RepositoryRow({ repo }: { repo: RepositorySummary }) {
  const { stats } = repo;
  const hasBounties = stats.openCount + stats.paidCount + stats.heldCount > 0 || BigInt(stats.locked.amount) > 0n;
  return (
    <li>
      <Link
        to={paths.repoDashboard(repo.name)}
        className={cn(
          'group grid grid-cols-[16px_minmax(0,1fr)] items-start gap-x-3 px-4 py-3.5 outline-offset-[-2px] transition-colors duration-120 hover:bg-surface-1 sm:items-center sm:px-5',
          COLUMNS,
        )}
      >
        <BookMarked className="mt-[3px] size-4 shrink-0 text-fg-subtle sm:mt-0" aria-hidden />
        <div className="min-w-0">
          <p className="flex items-center gap-2">
            <span className="data truncate font-medium text-fg">{repo.name}</span>
            {repo.isPrivate && <PrivateBadge />}
          </p>
          <p className="mt-0.5 truncate text-[13px] text-fg-subtle">{repo.description ?? 'No description'}</p>
          {/* Small screens: the columns collapse into one line. */}
          <p className="mt-1.5 flex flex-wrap items-center gap-x-2 text-[13px] text-fg-subtle sm:hidden">
            <span>{pluralize(stats.openCount, 'open bounty', 'open bounties')}</span>
            {hasBounties && (
              <>
                <span aria-hidden>·</span>
                <Amount value={stats.locked} /> locked
              </>
            )}
          </p>
        </div>
        <span className="data hidden text-right text-fg sm:block">{stats.openCount}</span>
        <span className="hidden text-right sm:block">
          {hasBounties ? <Amount value={stats.locked} className="text-[14px]" /> : <span className="text-fg-subtle">—</span>}
        </span>
        <span className="hidden text-right text-[13px] text-fg-muted sm:block">
          <LastActivity at={repo.lastActivityAt} />
        </span>
        <ChevronRight
          className="hidden size-4 text-fg-subtle transition-transform duration-120 group-hover:translate-x-0.5 sm:block"
          aria-hidden
        />
      </Link>
    </li>
  );
}

function RowSkeleton() {
  return (
    <li className="flex items-center gap-3 px-4 py-4 sm:px-5" aria-hidden>
      <Skeleton className="size-4" />
      <div className="flex-1">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="mt-2 h-3 w-64 max-w-full" />
      </div>
      <Skeleton className="hidden h-4 w-24 sm:block" />
    </li>
  );
}

/** Every added repository of the organization; each row opens its dashboard. Search lives in the URL. */
export function RepositoryList() {
  const repos = useRepositories();
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const setQuery = (value: string) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (value) next.set('q', value);
        else next.delete('q');
        return next;
      },
      { replace: true },
    );

  const needle = q.trim().toLowerCase();
  const shown = (repos.data ?? []).filter(
    (r) => !needle || r.name.toLowerCase().includes(needle) || r.description?.toLowerCase().includes(needle),
  );

  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <div className="relative min-w-0 flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-fg-subtle" aria-hidden />
          <Input
            type="search"
            value={q}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Find a repository"
            aria-label="Find a repository"
            className="pl-9"
          />
        </div>
        <AddRepositoryDialog>
          <Button className="ml-auto">
            <Plus />
            Add repository
          </Button>
        </AddRepositoryDialog>
      </div>

      <div className="overflow-hidden rounded-lg border">
        <div
          className={cn('label hidden gap-x-3 border-b bg-surface-1 px-5 py-2.5 sm:grid', COLUMNS)}
          aria-hidden
        >
          <span />
          <span>Repository</span>
          <span className="text-right">Open</span>
          <span className="text-right">Locked</span>
          <span className="text-right">Activity</span>
          <span />
        </div>

        {repos.isPending ? (
          <ul className="divide-y" aria-busy>
            {[0, 1, 2, 3].map((i) => (
              <RowSkeleton key={i} />
            ))}
          </ul>
        ) : repos.error ? (
          <div className="p-4">
            <ErrorState error={repos.error} onRetry={() => void repos.refetch()} />
          </div>
        ) : shown.length === 0 ? (
          <div className="p-4">
            {needle ? (
              <EmptyState
                icon={SearchX}
                title={`No repository matches “${q.trim()}”.`}
                action={
                  <Button size="sm" onClick={() => setQuery('')}>
                    Clear search
                  </Button>
                }
                className="border-0"
              />
            ) : (
              <EmptyState
                icon={FolderGit2}
                title="No repositories added yet. Add one from GitHub to post bounties on it."
                action={
                  <AddRepositoryDialog>
                    <Button size="sm">
                      <Plus />
                      Add repository
                    </Button>
                  </AddRepositoryDialog>
                }
                className="border-0"
              />
            )}
          </div>
        ) : (
          <ul className="divide-y">
            {shown.map((repo) => (
              <RepositoryRow key={repo.name} repo={repo} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
