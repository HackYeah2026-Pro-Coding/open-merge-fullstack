import { loadFiller, validateFiller, type FillerData } from './filler-data';

const valid: FillerData = {
  authors: [
    { login: 'ann', name: 'Ann', githubId: 1, wallet: true },
    { login: 'bob', name: 'Bob', githubId: 2, wallet: false },
  ],
  repos: [{ name: 'r', description: 'd' }],
  bounties: [
    { repo: 'r', title: 'An open bounty', problem: 'p', expected: 'e', criteria: ['c'], reward: 10, labels: [], state: 'open', ageDays: 1 },
    { repo: 'r', title: 'A paid bounty', problem: 'p', expected: 'e', criteria: ['c'], reward: 10, labels: [], state: 'paid', author: 'ann', ageDays: 5 },
    { repo: 'r', title: 'A held bounty', problem: 'p', expected: 'e', criteria: ['c'], reward: 10, labels: [], state: 'payout_held', author: 'bob', ageDays: 5 },
  ],
};

const withBounty = (over: Partial<FillerData['bounties'][number]>): FillerData => ({
  ...valid,
  bounties: [...valid.bounties, { ...valid.bounties[0], title: 'Another bounty', ...over }],
});

describe('validateFiller', () => {
  it('accepts consistent data', () => {
    expect(validateFiller(valid)).toEqual([]);
  });

  it.each([
    ['an unknown repo', withBounty({ repo: 'nope' }), 'unknown repo'],
    ['the same bounty twice', withBounty({ title: 'An open bounty' }), 'listed twice'],
    ['a review state without an author', withBounty({ state: 'in_review' }), 'needs an author'],
    ['an author nobody defined', withBounty({ state: 'in_review', author: 'ghost' }), 'needs an author'],
    ['a paid bounty whose author has no wallet', withBounty({ state: 'paid', author: 'bob' }), 'needs a wallet'],
    ['a held bounty whose author has a wallet', withBounty({ state: 'payout_held', author: 'ann' }), 'must not have a wallet'],
  ])('rejects %s', (_name, data, problem) => {
    expect(validateFiller(data).join('\n')).toContain(problem);
  });

  it('rejects authors that share a GitHub id, which the database would refuse later', () => {
    const data = { ...valid, authors: [valid.authors[0], { ...valid.authors[1], githubId: 1 }] };
    expect(validateFiller(data)).toContain('authors share a githubId');
  });
});

describe('demo/filler.json', () => {
  const filler = loadFiller();

  it('is valid and shows every state a visitor can see on the dashboard', () => {
    expect(new Set(filler.bounties.map((b) => b.state))).toEqual(
      new Set(['open', 'in_review', 'in_review_split', 'payout_held', 'paid', 'closed']),
    );
  });

  it('keeps the repos of the story distinct from the demo repo', () => {
    expect(filler.repos.map((r) => r.name)).not.toContain('fair-split');
  });
});
