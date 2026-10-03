import { parseGithubRepoUrl } from './github-repo-url';

describe('parseGithubRepoUrl', () => {
  it.each([
    'https://github.com/nestjs/nest',
    'https://github.com/nestjs/nest/',
    'https://github.com/nestjs/nest.git',
    'http://www.github.com/nestjs/nest',
    'github.com/nestjs/nest',
    'https://github.com/nestjs/nest/issues/123',
  ])('extracts owner and repo from %s', (input) => {
    expect(parseGithubRepoUrl(input)).toEqual({ owner: 'nestjs', repo: 'nest' });
  });

  it('keeps dots and dashes in the repo name', () => {
    expect(parseGithubRepoUrl('https://github.com/vercel/next.js')).toEqual({
      owner: 'vercel',
      repo: 'next.js',
    });
  });

  it.each([
    '',
    'not a url',
    'https://gitlab.com/nestjs/nest',
    'https://github.com/nestjs',
    'https://github.com/',
    'ftp://github.com/nestjs/nest',
    'https://github.com/-bad/nest',
  ])('rejects %p', (input) => {
    expect(parseGithubRepoUrl(input)).toBeUndefined();
  });
});
