import { describe, expect, it } from 'vitest';
import { readFilters, writeFilters } from './bounty-filters';

describe('bounty filters in the URL', () => {
  it('reads defaults from an empty query', () => {
    expect(readFilters(new URLSearchParams())).toEqual({ status: undefined, sort: 'newest', q: '' });
  });

  it('ignores unknown status and sort values', () => {
    expect(readFilters(new URLSearchParams('status=bogus&sort=random'))).toEqual({ status: undefined, sort: 'newest', q: '' });
  });

  it('writes only non-default values and keeps unrelated params', () => {
    const next = writeFilters(new URLSearchParams('tab=x'), { status: 'paid', sort: 'reward', q: 'queue' });
    expect(next.toString()).toBe('tab=x&status=paid&sort=reward&q=queue');
  });

  it('clears values that return to their default', () => {
    const next = writeFilters(new URLSearchParams('status=paid&sort=reward&q=queue'), { status: undefined, sort: 'newest', q: ' ' });
    expect(next.toString()).toBe('');
  });
});
