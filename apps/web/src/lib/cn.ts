import { type ClassValue, clsx } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

/**
 * tailwind-merge must know the custom scales from index.css. Without this it reads
 * `text-ui` as a colour and drops `text-bg` next to it.
 */
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: ['hero', 'title', 'section', 'body', 'ui', 'label'],
      shadow: ['overlay'],
    },
  },
});

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
