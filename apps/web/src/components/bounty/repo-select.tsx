import type { RepositorySummary } from '@escrow/shared';
import { cn } from '@/lib/cn';
import { Select, SelectContent, SelectItem, SelectItemText, SelectTrigger, SelectValue } from '@/components/ui/select';

/** Radix Select cannot hold an empty value, so "every repository" has a sentinel. */
export const ALL_REPOS = '__all__';

type RepoSelectProps = {
  repos: RepositorySummary[];
  value: string | undefined;
  onChange: (repo: string | undefined) => void;
  /** Adds an "All repositories" choice, for filters. */
  allowAll?: boolean;
  /** Shows each repository's description under its name, for the bounty form. */
  detailed?: boolean;
  id?: string;
  invalid?: boolean;
  describedBy?: string;
  placeholder?: string;
  'aria-label'?: string;
  className?: string;
};

/** Picks one repository of the organization. */
export function RepoSelect({
  repos,
  value,
  onChange,
  allowAll,
  detailed,
  id,
  invalid,
  describedBy,
  placeholder = 'Choose a repository',
  'aria-label': ariaLabel,
  className,
}: RepoSelectProps) {
  return (
    <Select
      value={value ?? (allowAll ? ALL_REPOS : '')}
      onValueChange={(next) => onChange(next === ALL_REPOS ? undefined : next)}
    >
      <SelectTrigger
        id={id}
        aria-label={ariaLabel}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        className={cn(value && 'data', className)}
      >
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {allowAll && (
          <SelectItem value={ALL_REPOS}>
            <SelectItemText>All repositories</SelectItemText>
          </SelectItem>
        )}
        {repos.map((repo) => (
          <SelectItem key={repo.name} value={repo.name} className={detailed ? 'py-2' : undefined}>
            <span className="min-w-0">
              <span className="flex items-center gap-2">
                <span className="data text-fg">
                  <SelectItemText>{repo.name}</SelectItemText>
                </span>
                {repo.isPrivate && (
                  <span className="rounded-full border px-1.5 text-[11px] leading-[18px] text-fg-subtle">Private</span>
                )}
              </span>
              {detailed && repo.description && (
                <span className="mt-0.5 block max-w-[52ch] truncate text-[12.5px] text-fg-subtle">{repo.description}</span>
              )}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
