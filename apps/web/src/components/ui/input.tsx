import type { ComponentProps } from 'react';
import { cn } from '@/lib/cn';

export const fieldClass = cn(
  'w-full rounded-sm border bg-bg px-3 text-ui text-fg placeholder:text-fg-subtle',
  'transition-[border-color,box-shadow] duration-120',
  'hover:border-fg-subtle/50 focus-visible:border-brand focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-brand/20',
  'aria-invalid:border-danger aria-invalid:focus-visible:ring-danger/20',
  'disabled:cursor-not-allowed disabled:opacity-50',
);

export function Input({ className, ...props }: ComponentProps<'input'>) {
  return <input className={cn(fieldClass, 'h-9', className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<'textarea'>) {
  return <textarea className={cn(fieldClass, 'min-h-32 resize-y py-2.5 leading-relaxed', className)} {...props} />;
}

export function Label({ className, ...props }: ComponentProps<'label'>) {
  return <label className={cn('text-ui font-medium text-fg', className)} {...props} />;
}
