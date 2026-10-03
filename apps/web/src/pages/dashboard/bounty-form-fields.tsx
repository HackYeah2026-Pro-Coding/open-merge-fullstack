import { cn } from '@/lib/cn';
import { Input, Label, Textarea } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Markdown } from '@/components/common/markdown';

export const TOKEN = { symbol: 'USDC', decimals: 6 };
const PRESET_LABELS = ['bug', 'feature', 'docs', 'performance', 'good first issue'];
const QUICK_REWARDS = ['100', '250', '500', '1000'];

export const BODY_TEMPLATE = `Describe the problem and the outcome you want.

## Acceptance criteria

- `;

export function FieldError({ id, message }: { id: string; message: string | undefined }) {
  if (!message) return null;
  return (
    <p id={id} className="mt-2 text-[13px] text-danger">
      {message}
    </p>
  );
}

export function DescriptionField({ id, value, onChange }: { id: string; value: string; onChange: (value: string) => void }) {
  return (
    <Tabs defaultValue="write">
      <div className="flex items-end justify-between">
        <Label htmlFor={id}>Description</Label>
        <TabsList aria-label="Description mode">
          <TabsTrigger value="write">Write</TabsTrigger>
          <TabsTrigger value="preview">Preview</TabsTrigger>
        </TabsList>
      </div>
      <TabsContent value="write" className="mt-2">
        <Textarea id={id} value={value} onChange={(e) => onChange(e.target.value)} className="data min-h-64 text-[13px]" />
        <p className="mt-2 text-[13px] text-fg-subtle">Markdown. Becomes the body of the GitHub issue.</p>
      </TabsContent>
      <TabsContent value="preview" className="mt-2 min-h-64 rounded-sm border px-4 py-3">
        <Markdown source={value} />
      </TabsContent>
    </Tabs>
  );
}

export function LabelPicker({ value, onChange }: { value: string[]; onChange: (labels: string[]) => void }) {
  const toggle = (label: string) => onChange(value.includes(label) ? value.filter((l) => l !== label) : [...value, label]);
  return (
    <fieldset>
      <legend className="text-ui font-medium">Labels</legend>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {PRESET_LABELS.map((label) => {
          const on = value.includes(label);
          return (
            <button
              key={label}
              type="button"
              aria-pressed={on}
              onClick={() => toggle(label)}
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
  );
}

type RewardFieldProps = { id: string; value: string; onChange: (value: string) => void; error: string | undefined };

export function RewardField({ id, value, onChange, error }: RewardFieldProps) {
  return (
    <div>
      <Label htmlFor={id}>Reward</Label>
      <div className="relative mt-2 max-w-xs">
        <Input
          id={id}
          inputMode="decimal"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="500"
          aria-invalid={!!error}
          aria-describedby={`${id}-hint${error ? ` ${id}-error` : ''}`}
          className="data h-10 pr-16 text-[15px]"
        />
        <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-[13px] font-medium text-fg-subtle">
          {TOKEN.symbol}
        </span>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {QUICK_REWARDS.map((quick) => (
          <button
            key={quick}
            type="button"
            onClick={() => onChange(quick)}
            className="data h-7 rounded-sm border px-2.5 text-[12.5px] text-fg-muted transition-colors duration-120 hover:border-fg-subtle hover:text-fg"
          >
            {Number(quick).toLocaleString('en-US')}
          </button>
        ))}
      </div>
      <FieldError id={`${id}-error`} message={error} />
      <p id={`${id}-hint`} className="mt-2 text-[13px] text-fg-subtle">
        Locked when you create the bounty, released when you merge the pull request that resolves it.
      </p>
    </div>
  );
}
