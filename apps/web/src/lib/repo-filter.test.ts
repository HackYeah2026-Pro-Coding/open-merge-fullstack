import { describe, expect, it } from 'vitest';
import type { RepositorySummary } from '@escrow/shared';
import { hasBounties, matchRepos, splitRepos } from './repo-filter';

function repo(name: string, patch: Partial<RepositorySummary['stats']> = {}, description: string | null = null): RepositorySummary {
  return {
    name,
    fullName: `acme/${name}`,
    url: `https://github.com/acme/${name}`,
    description,
    isPrivate: false,
    lastActivityAt: null,
    stats: {
      locked: { amount: '0', symbol: 'OMT', decimals: 6 },
      paid: { amount: '0', symbol: 'OMT', decimals: 6 },
      openCount: 0,
      paidCount: 0,
      heldCount: 0,
      ...patch,
    },
  };
}

const names = (repos: RepositorySummary[]) => repos.map((r) => r.name);
const many = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((name) => repo(name));

describe('splitRepos', () => {
  it('shows every repository when they fit', () => {
    const six = many.slice(0, 6);
    expect(splitRepos(six, undefined)).toEqual({ visible: six, overflow: [] });
  });

  it('keeps one chip free for the picker when they do not fit', () => {
    const { visible, overflow } = splitRepos(many, undefined);
    expect(names(visible)).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(names(overflow)).toEqual(['f', 'g', 'h']);
  });

  it('keeps a selected visible repository where it is', () => {
    const { visible, overflow } = splitRepos(many, 'b');
    expect(names(visible)).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(names(overflow)).toEqual(['f', 'g', 'h']);
  });

  it('promotes a selected overflow repository into the last chip', () => {
    const { visible, overflow } = splitRepos(many, 'g');
    expect(names(visible)).toEqual(['a', 'b', 'c', 'd', 'g']);
    expect(names(overflow)).toEqual(['e', 'f', 'h']);
  });

  it('ignores a selection that is not a known repository', () => {
    const { visible, overflow } = splitRepos(many, 'gone');
    expect(names(visible)).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(names(overflow)).toEqual(['f', 'g', 'h']);
  });
});

describe('matchRepos', () => {
  const repos = [repo('taskq', {}, 'Job queue'), repo('fetchkit', {}, 'HTTP client'), repo('docs')];

  it('returns everything for a blank query', () => {
    expect(matchRepos(repos, '  ')).toBe(repos);
  });

  it('matches names and descriptions regardless of case', () => {
    expect(names(matchRepos(repos, 'TASK'))).toEqual(['taskq']);
    expect(names(matchRepos(repos, 'http'))).toEqual(['fetchkit']);
  });

  it('returns nothing when nothing matches', () => {
    expect(matchRepos(repos, 'zzz')).toEqual([]);
  });
});

describe('hasBounties', () => {
  it('is false for a repository without any activity', () => {
    expect(hasBounties(repo('docs'))).toBe(false);
  });

  it.each([{ openCount: 1 }, { paidCount: 2 }, { heldCount: 1 }])('is true when %o', (stats) => {
    expect(hasBounties(repo('taskq', stats))).toBe(true);
  });

  it('is true when funds are still locked', () => {
    expect(hasBounties(repo('taskq', { locked: { amount: '1', symbol: 'OMT', decimals: 6 } }))).toBe(true);
  });
});
