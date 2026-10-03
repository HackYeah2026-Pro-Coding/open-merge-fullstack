import { useEffect, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/cn';
import { Tooltip } from '@/components/ui/tooltip';

type CopyButtonProps = { value: string; label: string; className?: string };

/** Copies `value` and confirms in place. `label` names what is copied, for screen readers. */
export function CopyButton({ value, label, className }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1600);
    return () => clearTimeout(timer);
  }, [copied]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
    } catch (error) {
      toast.error('Could not copy', { description: error instanceof Error ? error.message : String(error) });
    }
  };

  return (
    <Tooltip content={copied ? 'Copied' : `Copy ${label}`}>
      <button
        type="button"
        onClick={copy}
        aria-label={copied ? `${label} copied` : `Copy ${label}`}
        className={cn(
          'inline-flex size-6 shrink-0 items-center justify-center rounded-sm text-fg-subtle transition-colors duration-120 hover:bg-surface-2 hover:text-fg',
          copied && 'text-ok hover:text-ok',
          className,
        )}
      >
        {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      </button>
    </Tooltip>
  );
}
