import { describe, expect, it } from 'vitest';
import { readFilters, writeFilters } from './bounty-filters';

describe('bounty filters in the URL', () => {
  it('reads defaults from an empty query', () => {
    expect(readFilters(new URLSearchParams())).toEqual({ repo: undefined, status: undefined, sort: 'newest', q: '' });
  });

  it('ignores unknown status and sort values', () => {
    expect(readFilters(new URLSearchParams('status=bogus&sort=random&repo='))).toEqual({
      repo: undefined,
      status: undefined,
      sort: 'newest',
      q: '',
    });
  });

  it('writes only non-default values and keeps unrelated params', () => {
    const next = writeFilters(new URLSearchParams('tab=x'), { repo: 'taskq', status: 'paid', sort: 'reward', q: 'queue' });
    expect(next.toString()).toBe('tab=x&repo=taskq&status=paid&sort=reward&q=queue');
  });

  it('clears values that return to their default', () => {
    const next = writeFilters(new URLSearchParams('repo=taskq&status=paid&sort=reward&q=queue'), {
      repo: undefined,
      status: undefined,
      sort: 'newest',
      q: ' ',
    });
    expect(next.toString()).toBe('');
  });
});
