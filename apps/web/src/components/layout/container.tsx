import type { ComponentProps, ReactNode } from 'react';
import { cn } from '@/lib/cn';

export function Container({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('mx-auto w-full max-w-6xl px-4 sm:px-6', className)} {...props} />;
}

type PageHeaderProps = {
  title: ReactNode;
  description?: ReactNode;
  eyebrow?: ReactNode;
  actions?: ReactNode;
  className?: string;
};

export function PageHeader({ title, description, eyebrow, actions, className }: PageHeaderProps) {
  return (
    <header className={cn('flex flex-col gap-5 pt-10 pb-8 sm:flex-row sm:items-end sm:justify-between sm:pt-14', className)}>
      <div className="min-w-0">
        {eyebrow && <div className="label mb-3">{eyebrow}</div>}
        <h1 className="text-[26px] font-semibold tracking-[-0.02em] sm:text-title">{title}</h1>
        {description && <p className="mt-2 max-w-2xl text-body text-fg-muted">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </header>
  );
}
