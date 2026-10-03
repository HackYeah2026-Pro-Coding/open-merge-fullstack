import { Toaster as Sonner } from 'sonner';
import { useTheme } from '@/lib/theme';

export function Toaster() {
  const { theme } = useTheme();
  return (
    <Sonner
      theme={theme}
      position="bottom-right"
      offset={20}
      mobileOffset={16}
      gap={8}
      toastOptions={{
        classNames: {
          toast:
            '!rounded-md !border !border-border !bg-surface-1 !text-fg !shadow-overlay !font-sans !text-ui !gap-2.5 !px-4 !py-3',
          title: '!font-medium',
          description: '!text-fg-muted !text-[13px]',
          success: '[&_[data-icon]]:!text-ok',
          error: '[&_[data-icon]]:!text-danger',
          actionButton: '!bg-fg !text-bg !rounded-sm',
        },
      }}
    />
  );
}
