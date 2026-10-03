import { describe, expect, it } from 'vitest';
import { filterRepos, parseRepoQuery } from './repo-query';

const ORG = 'Acme';

describe('parseRepoQuery', () => {
  it('matches plain text against names, ignoring case and spaces around it', () => {
    expect(parseRepoQuery('  TaskQ ', ORG)).toEqual({ kind: 'match', needle: 'taskq' });
  });

  it('reads one repository from the link forms people paste', () => {
    for (const input of [
      'https://github.com/Acme/taskq',
      'github.com/acme/taskq/',
      'http://www.github.com/Acme/taskq.git',
      'https://github.com/Acme/taskq/issues/12',
      'https://github.com/Acme/taskq?tab=readme',
      'acme/taskq',
    ]) {
      expect(parseRepoQuery(input, ORG)).toEqual({ kind: 'exact', name: 'taskq' });
    }
  });

  it('lists everything for a link to the organization itself', () => {
    expect(parseRepoQuery('https://github.com/Acme', ORG)).toEqual({ kind: 'match', needle: '' });
  });

  it('flags a repository or account outside the organization', () => {
    expect(parseRepoQuery('https://github.com/nestjs/nest', ORG)).toEqual({ kind: 'outside', fullName: 'nestjs/nest' });
    expect(parseRepoQuery('nestjs/nest', ORG)).toEqual({ kind: 'outside', fullName: 'nestjs/nest' });
    expect(parseRepoQuery('github.com/nestjs', ORG)).toEqual({ kind: 'outside', fullName: 'nestjs' });
  });
});

describe('filterRepos', () => {
  const repos = [
    { name: 'fetchkit', description: 'HTTP client used by taskq' },
    { name: 'taskq-cli', description: null },
    { name: 'taskq', description: 'Job queue' },
    { name: 'docs', description: null },
  ];

  it('keeps names or descriptions containing the text, names starting with it first', () => {
    expect(filterRepos(repos, { kind: 'match', needle: 'taskq' }).map((r) => r.name)).toEqual([
      'taskq-cli',
      'taskq',
      'fetchkit',
    ]);
  });

  it('keeps everything for empty text', () => {
    expect(filterRepos(repos, { kind: 'match', needle: '' })).toHaveLength(4);
  });

  it('keeps only the named repository for an exact query', () => {
    expect(filterRepos(repos, { kind: 'exact', name: 'TaskQ' }).map((r) => r.name)).toEqual(['taskq']);
  });

  it('keeps nothing for a repository outside the organization', () => {
    expect(filterRepos(repos, { kind: 'outside', fullName: 'nestjs/nest' })).toEqual([]);
  });
});
