import { Avatar as AvatarPrimitive } from 'radix-ui';
import { cn } from '@/lib/cn';

type AvatarProps = { login: string; src: string | null; size?: number; className?: string };

/** GitHub avatar with an initials fallback. */
export function Avatar({ login, src, size = 20, className }: AvatarProps) {
  const initials = login.replace(/[^a-zA-Z0-9]/g, '').slice(0, 2).toUpperCase();
  return (
    <AvatarPrimitive.Root
      className={cn('inline-flex shrink-0 overflow-hidden rounded-full border bg-surface-2 align-middle', className)}
      style={{ width: size, height: size }}
    >
      {src && <AvatarPrimitive.Image src={src} alt="" className="size-full object-cover" />}
      <AvatarPrimitive.Fallback
        className="flex size-full items-center justify-center font-medium text-fg-muted"
        style={{ fontSize: Math.max(9, Math.round(size * 0.4)) }}
      >
        {initials}
      </AvatarPrimitive.Fallback>
    </AvatarPrimitive.Root>
  );
}
