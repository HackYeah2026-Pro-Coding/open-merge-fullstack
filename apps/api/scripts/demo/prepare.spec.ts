import type { PrismaClient } from '../../src/generated/prisma/client';
import { UsageError } from './errors';
import { FakeGithub, notFound } from './fake-github';
import { prepare } from './prepare';
import { loadScenario } from './scenario';

const scenario = loadScenario();
const LIVE = 'fair-split';
const TWIN = scenario.live.twinRepo;
const info = (name: string) => ({ full_name: `Acme/${name}`, html_url: `https://github.com/Acme/${name}`, description: null, private: false, default_branch: 'main' });
const repoName = (path: string) => /\/repos\/Acme\/([^/]+)/.exec(path)?.[1] as string;

/** One GitHub for all three tokens, numbering what it creates, recording who did what in `order`. */
function github(order: string[], options: { botSees?: boolean } = {}) {
  let n = 0;
  const common: [RegExp, unknown][] = [
    [/^POST .*\/git\/blobs$/, () => ({ sha: `blob-${++n}` })],
    [/^POST .*\/git\/trees$/, () => ({ sha: `tree-${++n}` })],
    [/^POST .*\/git\/commits$/, (call: { path: string; body?: unknown }) => {
      const sha = `commit-${++n}`;
      order.push(`commit ${repoName(call.path)}: ${(call.body as { message: string }).message.split('\n').find((l) => l.startsWith('Closes')) ?? 'baseline'}`);
      return { sha };
    }],
    [/^GET .*\/git\/ref\/heads\/main$/, { object: { sha: 'initial' } }],
    [/^GET .*\/git\/ref\//, notFound],
    [/^(POST|PATCH) .*\/git\/refs/, {}],
  ];
  const admin = new FakeGithub([
    [/^GET \/repos\/Acme\/[^/]+$/, (call: { path: string }) => info(repoName(call.path))],
    [/^DELETE \/repos\/Acme\/[^/]+$/, (call: { path: string }) => { order.push(`delete ${repoName(call.path)}`); }],
    [/^POST \/orgs\/Acme\/repos$/, (call: { body?: unknown }) => info((call.body as { name: string }).name)],
    [/^PUT .*\/collaborators\//, undefined],
    ...common,
  ]);
  // No route for pull requests or statuses: prepare must open neither.
  const dev = new FakeGithub([[/^GET \/user$/, { login: 'dev' }], ...common]);
  const bot = new FakeGithub([[/^GET \/repos\/Acme\/[^/]+$/, options.botSees === false ? notFound : (call: { path: string }) => info(repoName(call.path))]]);
  return { admin, dev, bot };
}

function database(order: string[], existing: string[] = [LIVE, TWIN]) {
  const rows = new Map(existing.map((name) => [`Acme/${name}`, { id: `row-${name}`, githubRepoName: `Acme/${name}`, githubRepoUrl: `https://github.com/Acme/${name}` }]));
  const deleted = (table: string) => jest.fn(async (args: { where: { githubRepoId?: string } }) => {
    if (table === 'issue') order.push(`db: bounties of ${args.where.githubRepoId}`);
    return { count: 0 };
  });
  return {
    githubRepo: {
      findFirst: jest.fn(async ({ where }: { where: { githubRepoName: { equals: string } } }) => rows.get(where.githubRepoName.equals) ?? null),
      delete: jest.fn(async ({ where }: { where: { id: string } }) => { order.push(`db: remove ${where.id}`); }),
      upsert: jest.fn(async ({ create }: { create: { githubRepoName: string; githubRepoUrl: string } }) => {
        const row = { id: `row-${create.githubRepoName.split('/')[1]}`, ...create };
        rows.set(create.githubRepoName, row);
        order.push(`db: add ${create.githubRepoName}`);
        return row;
      }),
    },
    issue: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0), deleteMany: deleted('issue') },
    reviewerResult: { deleteMany: deleted('reviewerResult') },
    review: { deleteMany: deleted('review') },
    payout: { deleteMany: deleted('payout') },
    pullRequest: { deleteMany: deleted('pullRequest') },
    $transaction: jest.fn((operations: Promise<unknown>[]) => Promise.all(operations)),
  };
}

function setup(options: { botSees?: boolean; existing?: string[] } = {}) {
  const order: string[] = [];
  const { admin, dev, bot } = github(order, options);
  const db = database(order, options.existing);
  const fetchFn = jest.fn(async (_url: string, init: { body: string }) => {
    order.push(`bounty on ${JSON.parse(init.body).repoId}`);
    return new Response(JSON.stringify({ id: 'i1', githubIssueNumber: 7, githubIssueUrl: 'https://github.com/Acme/x/issues/7', escrowSignature: 'sig' }), { status: 201 });
  });
  const run = () =>
    prepare({
      db: db as unknown as PrismaClient,
      admin,
      dev,
      bot,
      org: 'Acme',
      scenario,
      apiUrl: 'http://api.test',
      webUrl: 'http://web.test',
      orphanFile: '/dev/null',
      sleep: jest.fn().mockResolvedValue(undefined),
      fetchFn: fetchFn as unknown as typeof fetch,
      log: jest.fn(),
    });
  return { order, admin, dev, bot, db, fetchFn, run };
}

describe('prepare', () => {
  it('clears the database, then rebuilds both repos up to the branch with the fix', async () => {
    const { order, run } = setup();
    await run();

    expect(order).toEqual([
      `db: bounties of row-${LIVE}`,
      `db: remove row-${LIVE}`,
      `db: bounties of row-${TWIN}`,
      `delete ${TWIN}`,
      `commit ${TWIN}: baseline`,
      `db: add Acme/${TWIN}`,
      `bounty on row-${TWIN}`,
      `commit ${TWIN}: Closes #7`,
      `delete ${LIVE}`,
      `commit ${LIVE}: baseline`,
      `commit ${LIVE}: Closes #1`,
    ]);
  });

  it('keeps the live repo out of the app, so the organizer adds it on stage', async () => {
    const { db, run } = setup();
    await run();
    expect(db.githubRepo.upsert.mock.calls.map(([args]) => args.create.githubRepoName)).toEqual([`Acme/${TWIN}`]);
  });

  it('leaves both pull requests to people: it opens none and waits for no review', async () => {
    const { dev, admin, run } = setup();
    await run();
    expect([...dev.called(/pulls|statuses/), ...admin.called(/pulls|statuses/)]).toEqual([]);
  });

  it('links the twin PR form to the bounty the API created, and the twin bounty page', async () => {
    const { run } = setup();
    const { twinCompareUrl, twinBountyUrl } = await run();
    const url = new URL(twinCompareUrl);
    expect(url.pathname).toBe(`/Acme/${TWIN}/compare/main...${scenario.branch}`);
    expect(url.searchParams.get('body')).toMatch(/^Closes #7$/m);
    expect(twinBountyUrl).toBe(`http://web.test/bounties/${TWIN}/7`);
  });

  it('hands the developer a link that opens the live PR with "Closes #1" filled in', async () => {
    const { run } = setup();
    const { liveCompareUrl } = await run();
    const url = new URL(liveCompareUrl);
    expect(url.pathname).toBe(`/Acme/${LIVE}/compare/main...${scenario.branch}`);
    expect(url.searchParams.get('expand')).toBe('1');
    expect(url.searchParams.get('title')).toBe(scenario.pullRequest.title);
    expect(url.searchParams.get('body')).toMatch(/^Closes #1$/m);
  });

  it('works on a first run, when neither repo is in the database yet', async () => {
    const { db, run } = setup({ existing: [] });
    await run();
    expect(db.githubRepo.delete).not.toHaveBeenCalled();
  });

  it('stops before locking a reward when the API\'s token cannot reach the re-created repo', async () => {
    const { fetchFn, run } = setup({ botSees: false });
    await expect(run()).rejects.toThrow(UsageError);
    expect(fetchFn).not.toHaveBeenCalled();
  });
});
