import type { PrismaClient } from '../../src/generated/prisma/client';
import { UsageError } from './errors';
import { FakeGithub, fakeWait, notFound } from './fake-github';
import { mergePullRequest, openPullRequest, pushFix } from './pull-request';
import { REVIEW_STATUS_CONTEXT } from './review-status';
import { loadScenario } from './scenario';

const scenario = loadScenario();
const REPO = { full_name: 'Acme/fair-split', html_url: 'https://github.com/Acme/fair-split', description: null, private: false, default_branch: 'main' };
const BRANCH_REF = /^(GET|PATCH) .*\/git\/ref(s)?\/heads\/fix\/split-remainder$/;
const status = (state: string, description = '') => ({ context: REVIEW_STATUS_CONTEXT, state, description });

function database(bounty: { githubIssueNumber: number | null; escrowStatus: string } | null = { githubIssueNumber: 12, escrowStatus: 'FUNDED' }) {
  return {
    githubRepo: { findFirst: jest.fn().mockResolvedValue({ id: 'repo_1' }) },
    issue: { findFirst: jest.fn().mockResolvedValue(bounty) },
  } as unknown as PrismaClient;
}

/** The pull request list as GitHub answers it, with the head commit under the test's control. */
const pullList = (head: () => string, state = 'open') =>
  () => [{ number: 13, title: 't', state, merged_at: null, html_url: 'https://github.com/Acme/fair-split/pull/13', head: { sha: head(), ref: 'fix/split-remainder' } }];

describe('openPullRequest', () => {
  function developer(branchExists = false) {
    let created = branchExists;
    return new FakeGithub([
      [BRANCH_REF, () => (created ? { object: { sha: 'v1-sha' } } : notFound())],
      [/^GET \/repos\/Acme\/fair-split$/, REPO],
      [/^GET .*\/git\/ref\/tags\/demo-fix-v1$/, { object: { sha: 'v1-sha' } }],
      [/^POST .*\/git\/refs$/, () => { created = true; return {}; }],
      [/^POST .*\/pulls$/, { number: 13, html_url: 'https://github.com/Acme/fair-split/pull/13' }],
    ]);
  }

  it('branches from the first fix and opens a pull request that closes the bounty issue', async () => {
    const dev = developer();
    const pull = await openPullRequest({ db: database(), dev, org: 'Acme', scenario, log: jest.fn() });

    expect(dev.called(/^POST .*git\/refs$/).map((c) => c.body)).toEqual([{ ref: 'refs/heads/fix/split-remainder', sha: 'v1-sha' }]);
    const [opened] = dev.called(/^POST .*\/pulls$/).map((c) => c.body as { title: string; head: string; base: string; body: string });
    expect(opened).toMatchObject({ title: scenario.pullRequest.title, head: 'fix/split-remainder', base: 'main' });
    expect(opened.body).toMatch(/^Closes #12$/m);
    expect(pull.number).toBe(13);
  });

  it('asks for a bounty first', async () => {
    const dev = developer();
    await expect(openPullRequest({ db: database(null), dev, org: 'Acme', scenario, log: jest.fn() })).rejects.toThrow(UsageError);
    expect(dev.calls).toEqual([]);
  });

  it('refuses to reuse a branch left from the last take', async () => {
    const dev = developer(true);
    await expect(openPullRequest({ db: database(), dev, org: 'Acme', scenario, log: jest.fn() })).rejects.toThrow('demo:reset');
    expect(dev.called(/^POST/)).toEqual([]);
  });

  it('warns when the escrow is not funded, but still opens the pull request', async () => {
    const log = jest.fn();
    await openPullRequest({ db: database({ githubIssueNumber: 12, escrowStatus: 'PENDING' }), dev: developer(), org: 'Acme', scenario, log });
    expect(log).toHaveBeenCalledWith(expect.stringContaining('PENDING'));
  });
});

describe('pushFix', () => {
  function developer(head: string, statuses: unknown[][] = []) {
    const state = { head };
    return {
      state,
      api: new FakeGithub([
        [/^GET .*\/pulls\?head=/, pullList(() => state.head)],
        [/^GET .*\/git\/ref\/tags\/demo-fix-v1$/, { object: { sha: 'v1-sha' } }],
        [/^GET .*\/git\/ref\/tags\/demo-fix-v2$/, { object: { sha: 'v2-sha' } }],
        [/^GET .*\/commits\/v1-sha\/statuses$/, () => statuses.shift() ?? []],
        [BRANCH_REF, (call: { method: string; body?: unknown }) => {
          if (call.method === 'PATCH') state.head = (call.body as { sha: string }).sha;
          return { object: { sha: state.head } };
        }],
      ]),
    };
  }
  const deps = (api: FakeGithub, wait = true) => ({ dev: api, org: 'Acme', scenario, wait, waitOptions: fakeWait(), log: jest.fn() });

  it('waits for the review of the first fix to end before pushing the finished one', async () => {
    const { api } = developer('v1-sha', [[status('pending')], [status('failure', 'Changes requested by Claude and Gemini')]]);
    await pushFix(deps(api));

    const calls = api.calls.map((c) => `${c.method} ${c.path.split('/').slice(-1)[0]}`);
    expect(calls.filter((c) => c.endsWith('statuses'))).toHaveLength(2);
    expect(api.called(/^PATCH/).map((c) => c.body)).toEqual([{ sha: 'v2-sha', force: false }]);
    // The push comes after the last status read, never between them.
    expect(api.calls.findLastIndex((c) => /statuses$/.test(c.path))).toBeLessThan(api.calls.findIndex((c) => c.method === 'PATCH'));
  });

  it('pushes at once with wait off', async () => {
    const { api } = developer('v1-sha');
    await pushFix(deps(api, false));
    expect(api.called(/statuses/)).toEqual([]);
    expect(api.called(/^PATCH/)).toHaveLength(1);
  });

  it('says so when the reviewers approved the incomplete fix, and carries on', async () => {
    const { api } = developer('v1-sha', [[status('success', 'Both reviewers approve')]]);
    const d = deps(api);
    await pushFix(d);
    expect(d.log).toHaveBeenCalledWith(expect.stringContaining('NOTE'));
    expect(api.called(/^PATCH/)).toHaveLength(1);
  });

  it('does nothing when the pull request already holds the finished fix', async () => {
    const { api } = developer('v2-sha');
    await pushFix(deps(api));
    expect(api.called(/^PATCH/)).toEqual([]);
  });

  it('refuses a head that is neither fix', async () => {
    const { api } = developer('someone-elses-sha');
    await expect(pushFix(deps(api))).rejects.toThrow('neither fix');
  });

  it('needs an open pull request', async () => {
    const api = new FakeGithub([[/^GET .*\/pulls\?head=/, []]]);
    await expect(pushFix(deps(api))).rejects.toThrow(UsageError);
  });
});

describe('mergePullRequest', () => {
  const maintainer = (checkState: string) =>
    new FakeGithub([
      [/^GET .*\/pulls\?head=/, pullList(() => 'v2-sha')],
      [/^GET .*\/commits\/v2-sha\/statuses$/, [status(checkState, 'whatever the reviewers said')]],
      [/^PUT .*\/pulls\/13\/merge$/, { sha: 'merge-sha' }],
    ]);

  it.each(['success', 'failure'])('merges with a %s check, because the check never gates the merge', async (state) => {
    const admin = maintainer(state);
    const sha = await mergePullRequest({ admin, org: 'Acme', scenario, log: jest.fn() });

    expect(sha).toBe('merge-sha');
    expect(admin.called(/^PUT/).map((c) => c.body)).toEqual([{ merge_method: 'squash' }]);
  });

  it('needs an open pull request', async () => {
    const admin = new FakeGithub([[/^GET .*\/pulls\?head=/, pullList(() => 'x', 'closed')]]);
    await expect(mergePullRequest({ admin, org: 'Acme', scenario, log: jest.fn() })).rejects.toThrow(UsageError);
  });
});
