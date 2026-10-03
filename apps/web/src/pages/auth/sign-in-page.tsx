import { Navigate, useNavigate, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { useSession, useSignIn } from '@/api/queries';
import { env } from '@/lib/env';
import { Container } from '@/components/layout/container';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { GithubIcon, LogoMark } from '@/components/common/icons';

/** Only same-site paths are honoured, so `next` cannot bounce someone to another origin. */
function safeNext(raw: string | null): string {
  return raw && raw.startsWith('/') && !raw.startsWith('//') ? raw : '/bounties';
}

export function SignInPage() {
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));
  const navigate = useNavigate();
  const session = useSession();
  const signIn = useSignIn();

  if (session.data?.user) return <Navigate to={next} replace />;

  const onSignIn = () =>
    signIn.mutate(next, {
      onSuccess: () => {
        if (env.apiMode === 'mock') {
          toast.success('Signed in with GitHub');
          void navigate(next, { replace: true });
        }
      },
      onError: (error) => toast.error('Sign-in failed', { description: error.message }),
    });

  return (
    <Container className="flex min-h-[calc(100dvh-56px-200px)] items-center py-16">
      <div className="w-full max-w-sm">
        <LogoMark className="size-9" />
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

        <p className="mt-6 text-[13px] text-fg-subtle">
          Developers link a Solana wallet after signing in. Maintainers manage bounties from the dashboard.
        </p>
        {env.apiMode === 'mock' && (
          <p className="mt-6 rounded-sm border border-dashed px-3 py-2 text-[12.5px] text-fg-subtle">
            Mock API: signs in as the persona chosen in the Mock panel.
          </p>
        )}
      </div>
    </Container>
  );
}
