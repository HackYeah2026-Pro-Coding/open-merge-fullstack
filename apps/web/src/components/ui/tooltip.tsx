import type { ComponentProps, ReactNode } from 'react';
import { Tooltip as TooltipPrimitive } from 'radix-ui';
import { cn } from '@/lib/cn';

export const TooltipProvider = TooltipPrimitive.Provider;

type TooltipProps = {
  content: ReactNode;
  children: ReactNode;
  side?: ComponentProps<typeof TooltipPrimitive.Content>['side'];
  className?: string;
};

/** Wraps a focusable child. Content shows on hover and on keyboard focus. */
export function Tooltip({ content, children, side = 'top', className }: TooltipProps) {
  return (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side={side}
          sideOffset={6}
          className={cn(
            'z-50 max-w-72 rounded-sm border bg-surface-2 px-2.5 py-1.5 text-[12.5px] leading-snug text-fg shadow-overlay',
            'animate-in fade-in-0 zoom-in-95 duration-120 data-[state=closed]:animate-out data-[state=closed]:fade-out-0',
            className,
          )}
        >
          {content}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}
