import type { PrismaClient } from '../../src/generated/prisma/client';
import { FakeGithub } from './fake-github';
import { REVIEW_STATUS_CONTEXT } from './review-status';
import { loadScenario } from './scenario';
import { collectStatus, formatStatus, nextStep, type DemoStatus } from './status';

const scenario = loadScenario();
const REPO = { full_name: 'Acme/fair-split', html_url: 'https://github.com/Acme/fair-split', description: null, private: false, default_branch: 'main' };

const base: DemoStatus = {
  repo: 'Acme/fair-split',
  main: 'baseline',
  bounty: { number: 12, reward: '50 OMT', escrow: 'FUNDED' },
  pull: { number: 13, state: 'open', head: 'v1', url: 'u', appState: 'open' },
  check: { state: 'failure', description: 'Changes requested' },
  review: { claude: 'changes', gemini: 'changes', ci: 'passed' },
  payout: null,
};
const status = (over: Partial<DemoStatus>): DemoStatus => ({ ...base, ...over });
const pull = (over: Partial<NonNullable<DemoStatus['pull']>>) => ({ ...base.pull!, ...over });

describe('nextStep', () => {
  it.each([
    ['nothing exists yet', status({ bounty: null, pull: null, check: null, review: null }), 'Create the bounty'],
    ['a bounty without a pull request', status({ pull: null, check: null, review: null }), 'pnpm demo:pr'],
    ['the first fix is still being reviewed', status({ check: { state: 'pending', description: null } }), 'Wait for the review of the first fix'],
    ['the first fix has been reviewed', status({}), 'pnpm demo:fix'],
    ['the finished fix is still being reviewed', status({ pull: pull({ head: 'v2' }), check: null }), 'Wait for the review of the finished fix'],
    ['the finished fix has been reviewed', status({ pull: pull({ head: 'v2' }), check: { state: 'success', description: '' } }), 'Merge on GitHub'],
    ['it was merged but the app never heard', status({ pull: pull({ state: 'merged', head: 'v2', appState: 'open' }) }), 'merge webhook'],
    ['it was merged and recorded, payout pending', status({ pull: pull({ state: 'merged', head: 'v2', appState: 'merged' }) }), 'Waiting for the payout'],
    ['it was paid', status({ pull: pull({ state: 'merged', head: 'v2', appState: 'merged' }), payout: { released: true, signature: 'sig' } }), 'pnpm demo:reset'],
    ['it was closed unmerged', status({ pull: pull({ state: 'closed' }) }), 'Start over'],
    ['the head is not a demo commit', status({ pull: pull({ head: 'other' }) }), 'Start over'],
  ])('when %s', (_name, input, expected) => {
    expect(nextStep(input)).toContain(expected);
  });
});

describe('formatStatus', () => {
  it('shows every step of the story on its own line, with what to do next', () => {
    const lines = formatStatus(base);
    expect(lines.join('\n')).toContain('#12 · 50 OMT · escrow FUNDED');
    expect(lines.join('\n')).toContain('#13 · open · head v1 · app sees open');
    expect(lines.join('\n')).toContain('failure: Changes requested');
    expect(lines.join('\n')).toContain('claude changes · gemini changes · CI passed');
    expect(lines.at(-1)).toContain('Next: Push the finished fix');
  });

  it('flags a main that is not at the baseline', () => {
    expect(formatStatus(status({ main: 'changed' }))[0]).toBe('Acme/fair-split: main is NOT at the baseline');
  });
});

describe('collectStatus', () => {
  const github = (pulls: unknown[]) =>
    new FakeGithub([
      [/^GET \/repos\/Acme\/fair-split$/, REPO],
      [/^GET .*\/git\/ref\/heads\/main$/, { object: { sha: 'base-sha' } }],
      [/^GET .*\/git\/ref\/tags\/demo-baseline$/, { object: { sha: 'base-sha' } }],
      [/^GET .*\/git\/ref\/tags\/demo-fix-v1$/, { object: { sha: 'v1-sha' } }],
      [/^GET .*\/git\/ref\/tags\/demo-fix-v2$/, { object: { sha: 'v2-sha' } }],
      [/^GET .*\/pulls\?head=/, pulls],
      [/^GET .*\/commits\/v1-sha\/statuses$/, [{ context: REVIEW_STATUS_CONTEXT, state: 'failure', description: 'Changes requested' }]],
    ]);

  it('reads an untouched demo as "main at baseline, nothing else"', async () => {
    const db = {
      githubRepo: { findFirst: jest.fn().mockResolvedValue({ id: 'repo_1' }) },
      issue: { findFirst: jest.fn().mockResolvedValue(null) },
    } as unknown as PrismaClient;

    const result = await collectStatus({ db, api: github([]), org: 'Acme', scenario });

    expect(result).toMatchObject({ main: 'baseline', bounty: null, pull: null, check: null, review: null, payout: null });
  });

  it('combines GitHub and the app\'s database into one picture of the first fix under review', async () => {
    const db = {
      githubRepo: { findFirst: jest.fn().mockResolvedValue({ id: 'repo_1' }) },
      issue: {
        findFirst: jest.fn().mockResolvedValue({ githubIssueNumber: 12, rewardAmount: 50_000_000n, escrowStatus: 'FUNDED', payout: null }),
      },
      pullRequest: {
        findUnique: jest.fn().mockResolvedValue({
          state: 'open',
          reviews: [
            {
              status: 'completed',
              ciState: 'passed',
              results: [
                { reviewer: 'claude', verdict: 'changes' },
                { reviewer: 'gemini', verdict: 'approve' },
              ],
            },
          ],
        }),
      },
    } as unknown as PrismaClient;
    const api = github([{ number: 13, state: 'open', merged_at: null, html_url: 'u', head: { sha: 'v1-sha', ref: 'fix/split-remainder' } }]);

    const result = await collectStatus({ db, api, org: 'Acme', scenario });

    expect(result.bounty).toEqual({ number: 12, reward: '50 OMT', escrow: 'FUNDED' });
    expect(result.pull).toMatchObject({ number: 13, state: 'open', head: 'v1', appState: 'open' });
    expect(result.check).toEqual({ state: 'failure', description: 'Changes requested' });
    expect(result.review).toEqual({ claude: 'changes', gemini: 'approve', ci: 'passed' });
  });
});
