import { useState, type FormEvent, type ReactNode } from 'react';
import type { GithubRepository } from '@escrow/shared';
import { Archive, Ban, BookMarked, Check, FolderGit2, Plus, Search, SearchX } from 'lucide-react';
import { toast } from 'sonner';
import { useAddRepository, useGithubRepositories, useOrganization } from '@/api/queries';
import { filterRepos, parseRepoQuery, type RepoQuery } from '@/lib/repo-query';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { RelativeTime } from '@/components/common/relative-time';
import { EmptyState, ErrorState } from '@/components/common/states';

function Badge({ children }: { children: ReactNode }) {
  return <span className="shrink-0 rounded-full border px-1.5 text-[11px] leading-[18px] text-fg-subtle">{children}</span>;
}

type RowProps = { repo: GithubRepository; adding: boolean; disabled: boolean; onAdd: () => void };

function GithubRepoRow({ repo, adding, disabled, onAdd }: RowProps) {
  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <BookMarked className="mt-[3px] size-4 shrink-0 self-start text-fg-subtle" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="flex min-w-0 items-center gap-2">
          <span className="data truncate font-medium text-fg">{repo.name}</span>
          {repo.isPrivate && <Badge>Private</Badge>}
        </p>
        <p className="mt-0.5 flex min-w-0 gap-1.5 text-[13px] text-fg-subtle">
          <span className="truncate">{repo.description ?? 'No description'}</span>
          {/* Small screens leave the line to the description. */}
          {repo.pushedAt && (
            <span className="hidden shrink-0 gap-1.5 sm:flex">
              <span aria-hidden>·</span>
              <span>
                Pushed <RelativeTime iso={repo.pushedAt} />
              </span>
            </span>
          )}
        </p>
      </div>
      {repo.added ? (
        <span className="inline-flex shrink-0 items-center gap-1.5 text-[13px] text-fg-muted">
          <Check className="size-3.5" aria-hidden />
          Added
        </span>
      ) : repo.archived ? (
        <span
          className="inline-flex shrink-0 items-center gap-1.5 text-[13px] text-fg-subtle"
          title="Archived on GitHub, so it cannot take new issues"
        >
          <Archive className="size-3.5" aria-hidden />
          Archived
        </span>
      ) : (
        <Button size="sm" onClick={onAdd} pending={adding} disabled={disabled} aria-label={`Add ${repo.fullName}`}>
          {!adding && <Plus />}
          Add
        </Button>
      )}
    </li>
  );
}

function RowSkeleton() {
  return (
    <li className="flex items-center gap-3 px-4 py-3.5" aria-hidden>
      <Skeleton className="size-4" />
      <div className="flex-1">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="mt-2 h-3 w-56 max-w-full" />
      </div>
      <Skeleton className="h-8 w-14" />
    </li>
  );
}

/** Why the list is empty, in one sentence. */
function NoResults({ query, text, org }: { query: RepoQuery; text: string; org: string }) {
  if (query.kind === 'outside') {
    return (
      <EmptyState
        icon={Ban}
        title={`${query.fullName} is outside ${org}. Only repositories in the organization can carry bounties.`}
        className="border-0"
      />
    );
  }
  const title =
    query.kind === 'exact'
      ? `${org}/${query.name} is not on GitHub, or OpenMerge cannot see it.`
      : `No repository in ${org} matches “${text.trim()}”.`;
  return <EmptyState icon={SearchX} title={title} className="border-0" />;
}

/** Search box and the organization's repositories on GitHub. Enter adds the only match. */
function RepositoryPicker({ org }: { org: string }) {
  const repos = useGithubRepositories();
  const add = useAddRepository();
  const [text, setText] = useState('');

  const query = parseRepoQuery(text, org);
  const shown = filterRepos(repos.data ?? [], query);
  // Enter adds a repository only when the text names it, not when it merely matches a description.
  const addable = shown.filter((r) => !r.added && !r.archived);
  const named =
    query.kind === 'exact'
      ? addable
      : query.kind === 'match' && query.needle
        ? addable.filter((r) => r.name.toLowerCase().includes(query.needle))
        : [];
  const only = named.length === 1 ? named[0] : undefined;

  const addRepo = (repo: GithubRepository) =>
    add.mutate(repo.name, {
      onSuccess: (added) =>
        toast.success(`${added.fullName} added`, {
          description: 'It shows on the dashboard and can carry bounties.',
        }),
      onError: (error) => toast.error('Could not add the repository', { description: error.message }),
    });

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (only && !add.isPending) addRepo(only);
  };

  return (
    <div>
      <form role="search" onSubmit={onSubmit} className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-fg-subtle" aria-hidden />
        <Input
          type="search"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Search by name or paste a link"
          aria-label="Search repositories on GitHub"
          className="pl-9"
        />
      </form>

      {/* Fixed height, so the centred dialog does not jump while the list filters. */}
      <div className="mt-3 h-[min(380px,50vh)] overflow-y-auto rounded-md border">
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
        ) : repos.data.length === 0 ? (
          <EmptyState
            icon={FolderGit2}
            title={`OpenMerge cannot see any repositories in ${org}. Give its GitHub token access to the organization, then try again.`}
            action={
              <Button size="sm" onClick={() => void repos.refetch()} pending={repos.isFetching}>
                Try again
              </Button>
            }
            className="border-0"
          />
        ) : shown.length === 0 ? (
          <NoResults query={query} text={text} org={org} />
        ) : (
          <ul className="divide-y">
            {shown.map((repo) => (
              <GithubRepoRow
                key={repo.fullName}
                repo={repo}
                adding={add.isPending && add.variables === repo.name}
                disabled={add.isPending}
                onAdd={() => addRepo(repo)}
              />
            ))}
          </ul>
        )}
      </div>

      <p className="mt-3 min-h-5 text-[12.5px] text-fg-subtle" aria-live="polite">
        {only && (
          <>
            Press <kbd className="data rounded-[4px] border bg-surface-2 px-1 text-[11.5px] text-fg-muted">Enter</kbd> to
            add <span className="data text-fg-muted">{only.name}</span>.
          </>
        )}
      </p>
    </div>
  );
}

/** Adds existing GitHub repositories of the organization; `children` is the button that opens it. */
export function AddRepositoryDialog({ children }: { children: ReactNode }) {
  const organization = useOrganization();
  const org = organization.data?.login;

  return (
    <Dialog>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent
        title="Add a repository"
        description={
          <>
            Repositories in <span className="data text-fg">{org ?? 'the organization'}</span> on GitHub. Once added, a
            repository shows on the dashboard and can carry bounties.
          </>
        }
        className="max-w-lg"
      >
        {org ? (
          <RepositoryPicker org={org} />
        ) : organization.error ? (
          <ErrorState error={organization.error} onRetry={() => void organization.refetch()} />
        ) : (
          <Skeleton className="h-9 w-full" />
        )}
      </DialogContent>
    </Dialog>
  );
}
