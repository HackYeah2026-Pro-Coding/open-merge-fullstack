import { useId, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import type { RepositorySummary } from '@escrow/shared';
import { toast } from 'sonner';
import { useCreateBounty, useRepositories } from '@/api/queries';
import { formatAmount, parseAmount } from '@/lib/format';
import { paths } from '@/lib/paths';
import { Breadcrumb } from '@/components/layout/breadcrumb';
import { Container, PageHeader } from '@/components/layout/container';
import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/common/states';
import { RepoSelect } from '@/components/bounty/repo-select';
import { BODY_TEMPLATE, DescriptionField, FieldError, LabelPicker, RewardField, TOKEN } from './bounty-form-fields';
import { BountySummaryCard } from './bounty-summary-card';

type Field = 'repo' | 'title' | 'reward';
type Errors = Partial<Record<Field, string>>;

function validate(repo: string | undefined, repos: RepositorySummary[] | undefined, title: string, reward: string): Errors {
  const errors: Errors = {};
  if (!repo) errors.repo = 'Choose the repository the issue goes to.';
  else if (repos && !repos.some((r) => r.name === repo)) errors.repo = `${repo} is not a repository of this organization.`;
  if (title.trim().length < 8) errors.title = 'Use at least 8 characters, like a good issue title.';
  else if (title.trim().length > 120) errors.title = 'Keep the title under 120 characters.';
  const parsed = parseAmount(reward, TOKEN.decimals);
  if (!parsed.ok) errors.reward = parsed.error;
  return errors;
}

/**
 * One form for both entry points: from the organization dashboard the repository
 * is chosen here; from a repository's dashboard it arrives pre-selected in ?repo=.
 */
export function NewBountyPage() {
  const id = useId();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const preset = params.get('repo') || undefined;
  const repos = useRepositories();
  const create = useCreateBounty();

  const [repo, setRepo] = useState<string | undefined>(preset);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState(BODY_TEMPLATE);
  const [reward, setReward] = useState('');
  const [labels, setLabels] = useState<string[]>([]);
  const [submitted, setSubmitted] = useState(false);

  const errors = validate(repo, repos.data, title, reward);
  // A pre-selected repository that does not exist is reported straight away.
  const shown: Errors = submitted ? errors : { repo: preset && repo === preset && repos.data ? errors.repo : undefined };
  const parsed = parseAmount(reward, TOKEN.decimals);
  const rewardAmount = parsed.ok ? { amount: parsed.baseUnits, ...TOKEN } : null;
  const selected = repos.data?.find((r) => r.name === repo);
  const backTo = preset ? paths.repoDashboard(preset) : '/dashboard';

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    const firstInvalid = (['repo', 'title', 'reward'] as const).find((field) => errors[field]);
    if (firstInvalid || !repo || !parsed.ok) {
      if (firstInvalid) document.getElementById(`${id}-${firstInvalid}`)?.focus();
      return;
    }

    create.mutate(
      {
        repo,
        title: title.trim(),
        body: body.trim() === BODY_TEMPLATE.trim() ? '' : body,
        rewardAmount: parsed.baseUnits,
        labels,
      },
      {
        onSuccess: (bounty) => {
          toast.success(`Bounty ${bounty.repository.name}#${bounty.issue.number} created`, {
            description: `${formatAmount(bounty.reward)} locked until a pull request that resolves it is merged.`,
          });
          void navigate(paths.bounty(bounty.repository.name, bounty.issue.number));
        },
        onError: (error) => toast.error('Could not create the bounty', { description: error.message }),
      },
    );
  };

  return (
    <Container>
      <Breadcrumb
        items={[
          { label: 'Dashboard', to: '/dashboard' },
          ...(preset ? [{ label: preset, to: paths.repoDashboard(preset), mono: true }] : []),
          { label: 'New bounty' },
        ]}
      />
      <PageHeader
        className="pt-5 sm:pt-6"
        title="New bounty"
        description="Opens an issue in the chosen repository and locks the reward until a pull request that resolves it is merged."
      />

      <div className="grid grid-cols-[minmax(0,1fr)] gap-10 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-12">
        <form onSubmit={onSubmit} noValidate className="space-y-8">
          <div>
            <Label htmlFor={`${id}-repo`}>Repository</Label>
            <div className="mt-2 max-w-sm">
              {repos.isPending ? (
                <Skeleton className="h-10 w-full" />
              ) : repos.error ? (
                <ErrorState error={repos.error} onRetry={() => void repos.refetch()} />
              ) : (
                <RepoSelect
                  id={`${id}-repo`}
                  repos={repos.data}
                  value={repo}
                  onChange={setRepo}
                  detailed
                  invalid={!!shown.repo}
                  describedBy={shown.repo ? `${id}-repo-error` : undefined}
                  className="h-10"
                />
              )}
            </div>
            <FieldError id={`${id}-repo-error`} message={shown.repo} />
          </div>

          <div>
            <Label htmlFor={`${id}-title`}>Title</Label>
            <Input
              id={`${id}-title`}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Retry queue drops jobs that time out mid-flight"
              aria-invalid={!!shown.title}
              aria-describedby={shown.title ? `${id}-title-error` : undefined}
              className="mt-2 h-10 text-[15px]"
              autoFocus={!!preset}
            />
            <FieldError id={`${id}-title-error`} message={shown.title} />
          </div>

          <DescriptionField id={`${id}-body`} value={body} onChange={setBody} />
          <LabelPicker value={labels} onChange={setLabels} />
          <RewardField id={`${id}-reward`} value={reward} onChange={setReward} error={shown.reward} />

          <div className="flex items-center gap-2 border-t pt-6">
            <Button type="submit" variant="primary" size="lg" pending={create.isPending}>
              {create.isPending ? 'Creating bounty…' : 'Create bounty'}
            </Button>
            <Button asChild variant="ghost" size="lg">
              <Link to={backTo}>Cancel</Link>
            </Button>
          </div>
          {create.error && (
            <p role="alert" className="text-[13px] text-danger">
              {create.error.message}
            </p>
          )}
        </form>

        <aside className="lg:sticky lg:top-20 lg:self-start">
          <BountySummaryCard
            title={title}
            reward={rewardAmount}
            labels={labels}
            repo={selected?.name ?? null}
          />
        </aside>
      </div>
    </Container>
  );
}
