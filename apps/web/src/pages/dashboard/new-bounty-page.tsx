import { useId, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import { useCreateBounty, useProject } from '@/api/queries';
import { formatAmount, parseAmount } from '@/lib/format';
import { cn } from '@/lib/cn';
import { Container, PageHeader } from '@/components/layout/container';
import { Button } from '@/components/ui/button';
import { Input, Label, Textarea } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Markdown } from '@/components/common/markdown';
import { BountySummaryCard } from './bounty-summary-card';

const TOKEN = { symbol: 'USDC', decimals: 6 };
const PRESET_LABELS = ['bug', 'feature', 'docs', 'performance', 'good first issue'];
const QUICK_REWARDS = ['100', '250', '500', '1000'];

const BODY_TEMPLATE = `Describe the problem and the outcome you want.

## Acceptance criteria

- `;

type Errors = Partial<Record<'title' | 'reward', string>>;

function validate(title: string, reward: string): Errors {
  const errors: Errors = {};
  if (title.trim().length < 8) errors.title = 'Use at least 8 characters, like a good issue title.';
  else if (title.trim().length > 120) errors.title = 'Keep the title under 120 characters.';
  const parsed = parseAmount(reward, TOKEN.decimals);
  if (!parsed.ok) errors.reward = parsed.error;
  return errors;
}

function FieldError({ id, message }: { id: string; message: string | undefined }) {
  if (!message) return null;
  return (
    <p id={id} className="mt-2 text-[13px] text-danger">
      {message}
    </p>
  );
}

export function NewBountyPage() {
  const id = useId();
  const navigate = useNavigate();
  const project = useProject();
  const create = useCreateBounty();

  const [title, setTitle] = useState('');
  const [body, setBody] = useState(BODY_TEMPLATE);
  const [reward, setReward] = useState('');
  const [labels, setLabels] = useState<string[]>([]);
  const [submitted, setSubmitted] = useState(false);

  const errors = validate(title, reward);
  const shown = submitted ? errors : {};
  const parsed = parseAmount(reward, TOKEN.decimals);
  const rewardAmount = parsed.ok ? { amount: parsed.baseUnits, ...TOKEN } : null;

  const toggleLabel = (label: string) =>
    setLabels((current) => (current.includes(label) ? current.filter((l) => l !== label) : [...current, label]));

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    if (Object.keys(errors).length > 0 || !parsed.ok) {
      document.getElementById(`${id}-${errors.title ? 'title' : 'reward'}`)?.focus();
      return;
    }

    create.mutate(
      { title: title.trim(), body: body.trim() === BODY_TEMPLATE.trim() ? '' : body, rewardAmount: parsed.baseUnits, labels },
      {
        onSuccess: (bounty) => {
          toast.success(`Bounty #${bounty.issue.number} created`, {
            description: `${formatAmount(bounty.reward)} locked until a pull request that resolves it is merged.`,
          });
          void navigate(`/bounties/${bounty.issue.number}`);
        },
        onError: (error) => toast.error('Could not create the bounty', { description: error.message }),
      },
    );
  };

  const repo = project.data ? `${project.data.owner}/${project.data.repo}` : '…';

  return (
    <Container>
      <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 pt-8 text-[13px] text-fg-subtle sm:pt-10">
        <Link to="/dashboard" className="hover:text-fg">
          Dashboard
        </Link>
        <ChevronRight className="size-3.5" aria-hidden />
        <span className="text-fg-muted" aria-current="page">
          New bounty
        </span>
      </nav>
      <PageHeader
        className="pt-5 sm:pt-6"
        title="New bounty"
        description={
          <>
            Opens an issue on <span className="data text-fg">{repo}</span> and locks the reward until a pull request that
            resolves it is merged.
          </>
        }
      />

      <div className="grid grid-cols-[minmax(0,1fr)] gap-10 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-12">
        <form onSubmit={onSubmit} noValidate className="space-y-8">
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
              autoFocus
            />
            <FieldError id={`${id}-title-error`} message={shown.title} />
          </div>

          <Tabs defaultValue="write">
            <div className="flex items-end justify-between">
              <Label htmlFor={`${id}-body`}>Description</Label>
              <TabsList aria-label="Description mode">
                <TabsTrigger value="write">Write</TabsTrigger>
                <TabsTrigger value="preview">Preview</TabsTrigger>
              </TabsList>
            </div>
            <TabsContent value="write" className="mt-2">
              <Textarea id={`${id}-body`} value={body} onChange={(e) => setBody(e.target.value)} className="data min-h-64 text-[13px]" />
              <p className="mt-2 text-[13px] text-fg-subtle">Markdown. Becomes the body of the GitHub issue.</p>
            </TabsContent>
            <TabsContent value="preview" className="mt-2 min-h-64 rounded-sm border px-4 py-3">
              <Markdown source={body} />
            </TabsContent>
          </Tabs>

          <fieldset>
            <legend className="text-ui font-medium">Labels</legend>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {PRESET_LABELS.map((label) => {
                const on = labels.includes(label);
                return (
                  <button
                    key={label}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggleLabel(label)}
                    className={cn(
                      'h-7 rounded-full border px-3 text-[13px] transition-colors duration-120',
                      on ? 'border-fg-muted bg-surface-2 text-fg' : 'text-fg-muted hover:border-fg-subtle hover:text-fg',
                    )}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </fieldset>

          <div>
            <Label htmlFor={`${id}-reward`}>Reward</Label>
            <div className="relative mt-2 max-w-xs">
              <Input
                id={`${id}-reward`}
                inputMode="decimal"
                value={reward}
                onChange={(e) => setReward(e.target.value)}
                placeholder="500"
                aria-invalid={!!shown.reward}
                aria-describedby={`${id}-reward-hint${shown.reward ? ` ${id}-reward-error` : ''}`}
                className="data h-10 pr-16 text-[15px]"
              />
              <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-[13px] font-medium text-fg-subtle">
                {TOKEN.symbol}
              </span>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {QUICK_REWARDS.map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setReward(value)}
                  className="data h-7 rounded-sm border px-2.5 text-[12.5px] text-fg-muted transition-colors duration-120 hover:border-fg-subtle hover:text-fg"
                >
                  {Number(value).toLocaleString('en-US')}
                </button>
              ))}
            </div>
            <FieldError id={`${id}-reward-error`} message={shown.reward} />
            <p id={`${id}-reward-hint`} className="mt-2 text-[13px] text-fg-subtle">
              Locked when you create the bounty, released when you merge the pull request that resolves it.
            </p>
          </div>

          <div className="flex items-center gap-2 border-t pt-6">
            <Button type="submit" variant="primary" size="lg" pending={create.isPending}>
              {create.isPending ? 'Creating bounty…' : 'Create bounty'}
            </Button>
            <Button asChild variant="ghost" size="lg">
              <Link to="/dashboard">Cancel</Link>
            </Button>
          </div>
          {create.error && (
            <p role="alert" className="text-[13px] text-danger">
              {create.error.message}
            </p>
          )}
        </form>

        <aside className="lg:sticky lg:top-20 lg:self-start">
          <BountySummaryCard title={title} reward={rewardAmount} labels={labels} repo={repo} />
        </aside>
      </div>
    </Container>
  );
}
