import { FakeGithub, notFound } from './fake-github';
import { publish } from './publish';
import { loadScenario } from './scenario';
import { stageFiles } from './stages';

const scenario = loadScenario();
const REPO = { full_name: 'Acme/fair-split', html_url: 'https://github.com/Acme/fair-split', description: null, private: false, default_branch: 'main' };

interface Options {
  repoExists?: boolean;
  /** Refs that already exist, by "heads/x" or "tags/x". */
  existingRefs?: string[];
}

/** A GitHub that numbers the objects it creates, so a test can follow which commit sits on which parent. */
function github(options: Options = {}, counter = { blob: 0, tree: 0, commit: 0 }): FakeGithub {
  const existing = new Set(options.existingRefs ?? []);
  return new FakeGithub([
    [/^GET \/repos\/Acme\/fair-split$/, options.repoExists === false ? notFound : REPO],
    [/^POST \/orgs\/Acme\/repos$/, REPO],
    [/^POST .*\/git\/blobs$/, () => ({ sha: `blob-${++counter.blob}` })],
    [/^POST .*\/git\/trees$/, () => ({ sha: `tree-${++counter.tree}` })],
    [/^POST .*\/git\/commits$/, () => ({ sha: `commit-${++counter.commit}` })],
    [/^GET .*\/git\/ref\/(.*)$/, (call: { path: string }) => (existing.has(call.path.split('/git/ref/')[1]) ? { object: { sha: 'old' } } : notFound())],
    [/^(POST|PATCH) .*\/git\/refs/, {}],
    [/^GET \/user$/, { login: 'dev-user' }],
    [/^PUT .*\/collaborators\/dev-user$/, { html_url: 'https://github.com/Acme/fair-split/invitations' }],
  ]);
}

/** Admin and developer share one counter, so every created object has an id of its own. */
function pair() {
  const counter = { blob: 0, tree: 0, commit: 0 };
  return { admin: github({}, counter), dev: github({}, counter) };
}

const bodies = (api: FakeGithub, pattern: RegExp) => api.called(pattern).map((call) => call.body as Record<string, unknown>);

describe('publish', () => {
  it('writes the baseline as a parentless commit and each fix on top of the previous one', async () => {
    const { admin, dev } = pair();

    const result = await publish({ admin, dev, org: 'Acme', scenario, log: jest.fn() });

    expect(bodies(admin, /git\/commits/)).toEqual([{ message: scenario.commits.baseline, tree: 'tree-1', parents: [] }]);
    expect(bodies(dev, /git\/commits/)).toEqual([
      { message: scenario.commits.v1, tree: 'tree-2', parents: ['commit-1'] },
      { message: scenario.commits.v2, tree: 'tree-3', parents: ['commit-2'] },
    ]);
    expect(result).toEqual({ baseline: 'commit-1', v1: 'commit-2', v2: 'commit-3' });
  });

  it('puts only a fix\'s own files on top of the previous tree, and the whole repo in the baseline', async () => {
    const { admin, dev } = pair();
    await publish({ admin, dev, org: 'Acme', scenario, log: jest.fn() });

    const [baselineTree] = bodies(admin, /git\/trees/);
    expect(baselineTree.base_tree).toBeUndefined();
    expect((baselineTree.tree as unknown[]).length).toBe(stageFiles('base').length);

    const [v1Tree, v2Tree] = bodies(dev, /git\/trees/);
    expect(v1Tree.base_tree).toBe('tree-1');
    expect((v1Tree.tree as { path: string }[]).map((e) => e.path)).toEqual(['src/splitBill.js']);
    expect(v2Tree.base_tree).toBe('tree-2');
    expect((v2Tree.tree as { path: string }[]).map((e) => e.path)).toEqual(['src/splitBill.js', 'test/splitBill.test.js']);
  });

  it('pins the three states with tags and sets the default branch to the baseline', async () => {
    const admin = github();
    await publish({ admin, dev: null, org: 'Acme', scenario, log: jest.fn() });

    expect(bodies(admin, /^POST .*git\/refs$/).map((b) => b.ref)).toEqual([
      `refs/tags/${scenario.refs.baseline}`,
      `refs/tags/${scenario.refs.v1}`,
      `refs/tags/${scenario.refs.v2}`,
      'refs/heads/main',
    ]);
  });

  it('moves refs that already exist, forcing the move, so a second publish refreshes the repo', async () => {
    const admin = github({ existingRefs: ['heads/main', `tags/${scenario.refs.v1}`] });
    await publish({ admin, dev: null, org: 'Acme', scenario, log: jest.fn() });

    const moved = admin.called(/^PATCH/);
    expect(moved.map((c) => c.path)).toEqual([
      `/repos/Acme/fair-split/git/refs/tags/${scenario.refs.v1}`,
      '/repos/Acme/fair-split/git/refs/heads/main',
    ]);
    expect(moved.every((c) => (c.body as { force: boolean }).force)).toBe(true);
  });

  it('has the admin write the fixes when there is no developer token', async () => {
    const admin = github();
    await publish({ admin, dev: null, org: 'Acme', scenario, log: jest.fn() });
    expect(admin.called(/git\/commits/)).toHaveLength(3);
    expect(admin.called(/collaborators/)).toHaveLength(0);
  });

  it('creates the repository only when it does not exist', async () => {
    const missing = github({ repoExists: false });
    await publish({ admin: missing, dev: null, org: 'Acme', scenario, log: jest.fn() });
    expect(bodies(missing, /^POST \/orgs\/Acme\/repos$/)).toEqual([
      { name: 'fair-split', description: scenario.repo.description, private: false, auto_init: true },
    ]);

    const present = github();
    await publish({ admin: present, dev: null, org: 'Acme', scenario, log: jest.fn() });
    expect(present.called(/^POST \/orgs/)).toHaveLength(0);
  });

  it('invites the developer and says where to accept', async () => {
    const log = jest.fn();
    const { admin, dev } = pair();
    await publish({ admin, dev, org: 'Acme', scenario, log });

    expect(bodies(admin, /collaborators/)).toEqual([{ permission: 'push' }]);
    expect(log).toHaveBeenCalledWith(expect.stringContaining('github.com/Acme/fair-split/invitations'));
  });
});
