import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { RotateCw } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Button } from '@/components/ui/button';

type EmptyStateProps = { icon: LucideIcon; title: string; action?: ReactNode; className?: string };

/** One sentence and a next step. */
export function EmptyState({ icon: Icon, title, action, className }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-start gap-4 rounded-md border border-dashed px-6 py-10', className)}>
      <span className="flex size-9 items-center justify-center rounded-sm border bg-surface-1 text-fg-subtle">
        <Icon className="size-4" />
      </span>
      <p className="max-w-md text-body text-fg-muted">{title}</p>
      {action}
    </div>
  );
}

type ErrorStateProps = { error: Error; onRetry: () => void; className?: string };

/** A failed load, with the message and a retry. */
export function ErrorState({ error, onRetry, className }: ErrorStateProps) {
  return (
    <div role="alert" className={cn('flex flex-col items-start gap-3 rounded-md border border-danger/30 bg-danger/5 px-5 py-5', className)}>
      <div>
        <p className="font-medium text-fg">Could not load this.</p>
        <p className="mt-1 text-fg-muted">{error.message}</p>
      </div>
      <Button size="sm" onClick={onRetry}>
        <RotateCw />
        Try again
      </Button>
    </div>
  );
}
