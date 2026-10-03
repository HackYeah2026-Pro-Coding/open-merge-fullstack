import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { PrismaClient } from '../../src/generated/prisma/client';
import { FakeGithub, notFound } from './fake-github';
import { UsageError } from './errors';
import { reset } from './reset';
import { loadScenario } from './scenario';

const scenario = loadScenario();
const REPO = { full_name: 'Acme/fair-split', html_url: 'https://github.com/Acme/fair-split', description: null, private: false, default_branch: 'main' };
const BASE = '/repos/Acme/fair-split';

/** A repo that still holds the last take: an open pull request, its branch, an issue, and main moved by a merge. */
function github(order: string[], options: { baselineTag?: boolean; deletesIssues?: boolean } = {}) {
  let mainSha = 'merged-sha';
  let openPulls = [{ number: 5 }];
  let issues = [
    { number: 1, node_id: 'ISSUE_1' },
    { number: 5, node_id: 'PR_5', pull_request: {} },
  ];
  const write = (what: string) => order.push(`github:${what}`);
  return new FakeGithub([
    [/^GET \/repos\/Acme\/fair-split$/, REPO],
    [/^GET .*\/git\/ref\/tags\/demo-baseline$/, options.baselineTag === false ? notFound : { object: { sha: 'baseline-sha' } }],
    [/^GET .*\/git\/ref\/heads\/main$/, () => ({ object: { sha: mainSha } })],
    [/^GET .*\/pulls\?state=open$/, () => openPulls],
    [/^PATCH .*\/pulls\/5$/, () => { write('close-pr'); openPulls = []; return {}; }],
    [/^GET .*\/branches$/, [{ name: 'main' }, { name: 'fix/split-remainder' }]],
    [/^DELETE .*\/git\/refs\/heads\/fix\/split-remainder$/, () => write('delete-branch')],
    [/^GET .*\/issues\?state=all$/, () => issues],
    [/^POST \/graphql$/, () => { write('delete-issue'); if (options.deletesIssues !== false) issues = issues.filter((i) => i.pull_request); return {}; }],
    [/^PATCH .*\/git\/refs\/heads\/main$/, (call: { body?: unknown }) => { write('reset-main'); mainSha = (call.body as { sha: string }).sha; return {}; }],
  ]);
}

function database(order: string[], locked: { escrowAddress: string; rewardAmount: bigint; githubIssueNumber: number }[] = []) {
  const deleted = (table: string) => jest.fn(async () => { order.push(`db:${table}`); return { count: 1 }; });
  const db = {
    githubRepo: { upsert: jest.fn().mockResolvedValue({ id: 'repo_1' }) },
    issue: { findMany: jest.fn().mockResolvedValue(locked), deleteMany: deleted('issue'), count: jest.fn().mockResolvedValue(0) },
    reviewerResult: { deleteMany: deleted('reviewerResult') },
    review: { deleteMany: deleted('review') },
    payout: { deleteMany: deleted('payout') },
    pullRequest: { deleteMany: deleted('pullRequest') },
    $transaction: jest.fn((operations: Promise<unknown>[]) => Promise.all(operations)),
  };
  return db;
}

const tmpFile = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'reset-')), 'orphans.json');

describe('reset', () => {
  it('empties the database before it touches GitHub, children before parents', async () => {
    const order: string[] = [];
    const db = database(order);
    await reset({ db: db as unknown as PrismaClient, admin: github(order), org: 'Acme', scenario, orphanFile: tmpFile(), log: jest.fn() });

    expect(order).toEqual([
      'db:reviewerResult', 'db:review', 'db:payout', 'db:pullRequest', 'db:issue',
      'github:close-pr', 'github:delete-branch', 'github:delete-issue', 'github:reset-main',
    ]);
    expect(db.issue.deleteMany).toHaveBeenCalledWith({ where: { githubRepoId: 'repo_1' } });
  });

  it('deletes real issues but not the pull request GitHub lists among them, and keeps the default branch', async () => {
    const order: string[] = [];
    const admin = github(order);
    await reset({ db: database(order) as unknown as PrismaClient, admin, org: 'Acme', scenario, orphanFile: tmpFile(), log: jest.fn() });

    expect(admin.called(/graphql/).map((c) => (c.body as { variables: { id: string } }).variables.id)).toEqual(['ISSUE_1']);
    expect(admin.called(/^DELETE/).map((c) => c.path)).toEqual([`${BASE}/git/refs/heads/fix/split-remainder`]);
  });

  it('force-moves main back to the baseline tag', async () => {
    const order: string[] = [];
    const admin = github(order);
    await reset({ db: database(order) as unknown as PrismaClient, admin, org: 'Acme', scenario, orphanFile: tmpFile(), log: jest.fn() });

    expect(admin.called(/^PATCH .*heads\/main$/).map((c) => c.body)).toEqual([{ sha: 'baseline-sha', force: true }]);
  });

  it('writes down every escrow that was still holding a reward before its row disappears', async () => {
    const order: string[] = [];
    const file = tmpFile();
    const locked = [{ escrowAddress: 'EscrowAddr1', rewardAmount: 50_000_000n, githubIssueNumber: 3 }];
    const log = jest.fn();

    await reset({ db: database(order, locked) as unknown as PrismaClient, admin: github(order), org: 'Acme', scenario, orphanFile: file, log });

    const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
    expect(saved).toEqual([expect.objectContaining({ escrowAddress: 'EscrowAddr1', rewardBaseUnits: '50000000', repo: 'Acme/fair-split', issueNumber: 3 })]);
    expect(log).toHaveBeenCalledWith(expect.stringContaining('50 OMT'));
  });

  it('leaves everything alone when the repo was never published', async () => {
    const order: string[] = [];
    const db = database(order);
    const run = reset({ db: db as unknown as PrismaClient, admin: github(order, { baselineTag: false }), org: 'Acme', scenario, orphanFile: tmpFile(), log: jest.fn() });

    await expect(run).rejects.toThrow(UsageError);
    await expect(run).rejects.toThrow('demo:publish');
    expect(order).toEqual([]);
  });

  it('does not claim success when GitHub still holds leftovers', async () => {
    const order: string[] = [];
    const run = reset({
      db: database(order) as unknown as PrismaClient,
      admin: github(order, { deletesIssues: false }),
      org: 'Acme',
      scenario,
      orphanFile: tmpFile(),
      log: jest.fn(),
    });
    await expect(run).rejects.toThrow('1 issue(s) still on GitHub');
  });
});
