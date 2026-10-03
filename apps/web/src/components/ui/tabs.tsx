import type { ComponentProps } from 'react';
import { Tabs as TabsPrimitive } from 'radix-ui';
import { cn } from '@/lib/cn';

export const Tabs = TabsPrimitive.Root;
export const TabsContent = TabsPrimitive.Content;

export function TabsList({ className, ...props }: ComponentProps<typeof TabsPrimitive.List>) {
  return <TabsPrimitive.List className={cn('inline-flex items-center gap-1', className)} {...props} />;
}

export function TabsTrigger({ className, ...props }: ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        'h-7 rounded-sm px-2.5 text-[13px] font-medium text-fg-subtle transition-colors duration-120',
        'hover:text-fg data-[state=active]:bg-surface-2 data-[state=active]:text-fg',
        className,
      )}
      {...props}
    />
  );
}
