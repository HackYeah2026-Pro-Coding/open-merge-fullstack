import { describe, expect, it } from 'vitest';
import { cn } from './cn';

describe('cn', () => {
  it('keeps a token colour next to a custom font size', () => {
    expect(cn('text-bg', 'text-ui')).toBe('text-bg text-ui');
  });

  it('still resolves conflicts within the custom font sizes', () => {
    expect(cn('text-ui', 'text-[15px]')).toBe('text-[15px]');
    expect(cn('text-ui', 'text-title')).toBe('text-title');
  });

  it('resolves conflicting token colours', () => {
    expect(cn('text-fg', 'text-money')).toBe('text-money');
  });
});
