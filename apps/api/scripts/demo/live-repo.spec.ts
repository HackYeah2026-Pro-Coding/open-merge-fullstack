import { UsageError } from './errors';
import { FakeGithub, notFound } from './fake-github';
import { GithubHttpError } from './github-api';
import { recreateRepo, requireBotAccess } from './live-repo';

const REPO = { full_name: 'Acme/fair-split', html_url: 'https://github.com/Acme/fair-split', description: null, private: false, default_branch: 'main' };
const files = [{ path: 'README.md', content: '# hi' }];

function admin(options: { exists?: boolean; createFailures?: number; deleteStatus?: number } = {}) {
  let failures = options.createFailures ?? 0;
  return new FakeGithub([
    [/^GET \/repos\/Acme\/fair-split$/, options.exists === false ? notFound : REPO],
    [/^DELETE \/repos\/Acme\/fair-split$/, () => {
      if (options.deleteStatus) throw new GithubHttpError(options.deleteStatus, 'Must have admin rights');
      return undefined;
    }],
    [/^POST \/orgs\/Acme\/repos$/, () => {
      if (failures-- > 0) throw new GithubHttpError(422, 'name already exists on this account');
      return REPO;
    }],
    [/^POST .*\/git\/blobs$/, { sha: 'blob' }],
    [/^POST .*\/git\/trees$/, { sha: 'tree' }],
    [/^POST .*\/git\/commits$/, { sha: 'baseline' }],
    [/^GET .*\/git\/ref\/heads\/main$/, { object: { sha: 'initial' } }],
    [/^PATCH .*\/git\/refs\/heads\/main$/, {}],
  ]);
}

const args = (api: FakeGithub, sleep = jest.fn().mockResolvedValue(undefined)) => ({
  admin: api,
  org: 'Acme',
  name: 'fair-split',
  description: 'd',
  private: false,
  files,
  message: 'feat: baseline',
  sleep,
  log: jest.fn(),
});

describe('recreateRepo', () => {
  it('deletes the old repository, creates it again and puts the baseline on main', async () => {
    const api = admin();
    const result = await recreateRepo(args(api));

    expect(api.calls.map((c) => `${c.method} ${c.path}`).slice(0, 3)).toEqual([
      'GET /repos/Acme/fair-split',
      'DELETE /repos/Acme/fair-split',
      'POST /orgs/Acme/repos',
    ]);
    expect(api.called(/^PATCH .*heads\/main$/).map((c) => c.body)).toEqual([{ sha: 'baseline', force: true }]);
    expect(result.baseline).toEqual({ sha: 'baseline', tree: 'tree' });
  });

  it('only creates when there is nothing to delete', async () => {
    const api = admin({ exists: false });
    await recreateRepo(args(api));
    expect(api.called(/^DELETE/)).toEqual([]);
  });

  it('retries while GitHub still holds the deleted name', async () => {
    const sleep = jest.fn().mockResolvedValue(undefined);
    const api = admin({ createFailures: 2 });
    await recreateRepo(args(api, sleep));
    expect(api.called(/^POST \/orgs/)).toHaveLength(3);
    expect(sleep).toHaveBeenCalledTimes(2);
  });

  it('gives up after a bounded number of tries', async () => {
    const api = admin({ createFailures: 99 });
    await expect(recreateRepo(args(api))).rejects.toThrow('name already exists');
    expect(api.called(/^POST \/orgs/)).toHaveLength(10);
  });

  it('names the missing scope when the token may not delete repositories', async () => {
    const run = recreateRepo(args(admin({ deleteStatus: 403 })));
    await expect(run).rejects.toThrow(UsageError);
    await expect(run).rejects.toThrow('delete_repo');
  });
});

describe('requireBotAccess', () => {
  it('passes when the bot can see the repository', async () => {
    await expect(requireBotAccess(new FakeGithub([[/^GET/, REPO]]), 'Acme', 'fair-split')).resolves.toBeUndefined();
  });

  it('explains that a re-created repo is lost to a token limited to selected repositories', async () => {
    await expect(requireBotAccess(new FakeGithub([[/^GET/, notFound]]), 'Acme', 'fair-split')).rejects.toThrow('all repositories');
  });
});
