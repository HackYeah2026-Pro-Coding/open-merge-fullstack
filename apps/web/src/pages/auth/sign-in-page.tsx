import { Navigate, useSearchParams } from 'react-router';
import { ArrowRight, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useProject, useSession, useSignIn } from '@/api/queries';
import { useOwnerViewAction } from '@/app/session-actions';
import { env } from '@/lib/env';
import { Container } from '@/components/layout/container';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { GithubIcon } from '@/components/common/icons';
import { LogoMark } from '@/components/common/logo';

/** Only same-site paths are honoured, so `next` cannot bounce someone to another origin. */
function safeNext(raw: string | null): string {
  return raw && raw.startsWith('/') && !raw.startsWith('//') ? raw : '/bounties';
}

const isOwnerPath = (path: string) => path.startsWith('/dashboard');

function OwnerOption({ disabled }: { disabled: boolean }) {
  const project = useProject();
  const owner = useOwnerViewAction();

  if (!project.data) return <Skeleton className="mt-4 h-[62px] w-full rounded-md" />;
  const { maintainer } = project.data;
  return (
    <button
      type="button"
      onClick={() => owner.open()}
      disabled={disabled || owner.pending}
      className="group mt-4 flex w-full items-center gap-3 rounded-md border bg-surface-1 px-4 py-3 text-left transition-colors duration-120 hover:border-fg-subtle/60 hover:bg-surface-2 disabled:opacity-60"
    >
      <Avatar login={maintainer.login} src={maintainer.avatarUrl} size={32} />
      <span className="min-w-0 flex-1">
        <span className="block font-medium text-fg">Open owner view</span>
        <span className="data block truncate text-[13px] text-fg-subtle">@{maintainer.login}</span>
      </span>
      {owner.pending ? (
        <Loader2 className="size-4 animate-spin text-fg-subtle" aria-hidden />
      ) : (
        <ArrowRight className="size-4 text-fg-subtle transition-transform duration-120 group-hover:translate-x-0.5" aria-hidden />
      )}
    </button>
  );
}

export function SignInPage() {
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));
  const session = useSession();
  const project = useProject();
  const signIn = useSignIn();

  // Owner pages need the owner view; everything else is the developer's.
  const user = session.data?.user;
  if (user) {
    const ownerTarget = isOwnerPath(next) ? next : '/dashboard';
    const developerTarget = isOwnerPath(next) ? '/bounties' : next;
    return <Navigate to={user.role === 'maintainer' ? ownerTarget : developerTarget} replace />;
  }

  const onSignIn = () =>
    signIn.mutate(next, {
      onSuccess: () => {
        if (env.apiMode === 'mock') toast.success('Signed in with GitHub');
      },
      onError: (error) => toast.error('Sign-in failed', { description: error.message }),
    });

  const repo = project.data ? `${project.data.owner}/${project.data.repo}` : 'this repository';

  return (
    <Container className="flex min-h-[calc(100dvh-56px-200px)] items-center py-16">
      <div className="w-full max-w-sm">
        <LogoMark className="h-11 w-auto text-fg" />
        <h1 className="mt-8 text-title font-semibold">Sign in to OpenMerge</h1>
        <p className="mt-3 text-body text-fg-muted">
          Your GitHub account identifies you on pull requests, so a merge can be matched to the right payout.
        </p>

        {session.isPending ? (
          <Skeleton className="mt-8 h-11 w-full" />
        ) : (
          <Button variant="primary" size="lg" className="mt-8 w-full" onClick={onSignIn} pending={signIn.isPending}>
            {!signIn.isPending && <GithubIcon className="size-[18px]" />}
            Continue with GitHub
          </Button>
        )}
        <p className="mt-4 text-[13px] text-fg-subtle">Developers link a Solana wallet after signing in.</p>

        <div className="mt-10 border-t pt-8">
          <p className="label">Project owner</p>
          <p className="mt-2 text-ui text-fg-muted">
            Bounties on <span className="data text-fg">{repo}</span> are posted and merged by its owner.
          </p>
          <OwnerOption disabled={signIn.isPending} />
        </div>
      </div>
    </Container>
  );
}
