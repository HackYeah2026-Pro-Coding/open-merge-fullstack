import { Link, useParams } from 'react-router';
import { ArrowUpRight, ChevronRight, GitPullRequest } from 'lucide-react';
import { ApiError } from '@/api';
import { useBounty, useProject, useSession } from '@/api/queries';
import { pluralize } from '@/lib/format';
import { Container } from '@/components/layout/container';
import { Avatar } from '@/components/ui/avatar';
import { Amount } from '@/components/common/amount';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState, ErrorState } from '@/components/common/states';
import { Markdown } from '@/components/common/markdown';
import { RelativeTime } from '@/components/common/relative-time';
import { Labels } from '@/components/bounty/bounty-row';
import { EscrowPanel, EscrowPanelSkeleton } from '@/components/bounty/escrow-panel';
import { PullRequestRow } from '@/components/bounty/pull-request-row';
import { StatusBadge } from '@/components/bounty/status';
import { SubmitCard } from '@/components/bounty/submit-card';
import { NotFoundPage } from '@/pages/not-found-page';

function Breadcrumb({ number }: { number: number | string }) {
  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 pt-8 text-[13px] text-fg-subtle sm:pt-10">
      <Link to="/bounties" className="hover:text-fg">
        Bounties
      </Link>
      <ChevronRight className="size-3.5" aria-hidden />
      <span className="data text-fg-muted" aria-current="page">
        #{number}
      </span>
    </nav>
  );
}

function BountySkeleton() {
  return (
    <div className="grid gap-10 pt-6 lg:grid-cols-[minmax(0,1fr)_360px]" aria-busy>
      <div>
        <Skeleton className="h-[22px] w-20 rounded-full" />
        <Skeleton className="mt-4 h-8 w-4/5" />
        <Skeleton className="mt-3 h-4 w-1/2" />
        <div className="mt-10 space-y-3">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-11/12" />
          <Skeleton className="h-4 w-3/4" />
        </div>
      </div>
      <EscrowPanelSkeleton />
    </div>
  );
}

export function BountyPage() {
  const params = useParams();
  const number = Number(params.number);
  const valid = Number.isInteger(number) && number > 0;
  const bounty = useBounty(number, { enabled: valid });
  const project = useProject();
  const session = useSession();

  if (!valid || (bounty.error instanceof ApiError && bounty.error.status === 404)) return <NotFoundPage />;

  return (
    <Container>
      <Breadcrumb number={params.number ?? ''} />
      {bounty.isPending || project.isPending ? (
        <BountySkeleton />
      ) : bounty.error || project.error ? (
        <div className="pt-6">
          <ErrorState
            error={(bounty.error ?? project.error) as Error}
            onRetry={() => {
              void bounty.refetch();
              void project.refetch();
            }}
          />
        </div>
      ) : (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-10 pt-5 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-12">
          <article className="min-w-0">
            <header>
              <StatusBadge status={bounty.data.status} />
              <h1 className="mt-4 text-[26px] font-semibold tracking-[-0.02em] text-balance sm:text-title">
                {bounty.data.title} <span className="data font-normal text-fg-subtle">#{bounty.data.issue.number}</span>
              </h1>
              <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-[13px] text-fg-subtle">
                <span className="inline-flex items-center gap-1.5">
                  <Avatar login={bounty.data.createdBy.login} src={bounty.data.createdBy.avatarUrl} size={18} />
                  <span className="text-fg-muted">{bounty.data.createdBy.login}</span>
                </span>
                <span>
                  posted <RelativeTime iso={bounty.data.createdAt} />
                </span>
                <span aria-hidden>·</span>
                <a
                  href={bounty.data.issue.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-0.5 text-fg-muted hover:text-fg"
                >
                  View on GitHub
                  <ArrowUpRight className="size-3.5" aria-hidden />
                </a>
              </div>
              {/* The escrow panel sits below the article on small screens; keep the reward visible up top. */}
              <div className="mt-5 flex items-baseline gap-3 rounded-md border bg-surface-1 px-4 py-3 lg:hidden">
                <span className="label">Reward</span>
                <Amount value={bounty.data.reward} large className="text-[22px] font-medium" />
              </div>
              {bounty.data.labels.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-1.5">
                  <Labels labels={bounty.data.labels} />
                </div>
              )}
            </header>

            <section aria-labelledby="description" className="mt-8 border-t pt-8">
              <h2 id="description" className="sr-only">
                Description
              </h2>
              <Markdown source={bounty.data.body} />
            </section>

            <section aria-labelledby="pull-requests" className="mt-12">
              <div className="mb-3 flex items-baseline justify-between">
                <h2 id="pull-requests" className="text-[17px] font-semibold tracking-[-0.01em]">
                  Pull requests
                </h2>
                <span className="text-[13px] text-fg-subtle">{pluralize(bounty.data.submissions.length, 'submission')}</span>
              </div>
              {bounty.data.submissions.length === 0 ? (
                <EmptyState
                  icon={GitPullRequest}
                  title={`No pull requests yet. Open one that references #${bounty.data.issue.number} and it shows up here with its check.`}
                />
              ) : (
                <ul className="divide-y rounded-lg border">
                  {bounty.data.submissions.map((s) => (
                    <PullRequestRow key={s.id} submission={s} />
                  ))}
                </ul>
              )}
            </section>
          </article>

          <aside className="lg:sticky lg:top-20 lg:self-start">
            <EscrowPanel bounty={bounty.data}>
              <SubmitCard bounty={bounty.data} project={project.data} user={session.data?.user ?? null} />
            </EscrowPanel>
          </aside>
        </div>
      )}
    </Container>
  );
}
