import type { PrismaClient } from '../../src/generated/prisma/client';
import { createBounty } from './bounty';
import { UsageError } from './errors';
import { issueBody, loadScenario } from './scenario';

const scenario = loadScenario();
const REPO_ROW = { id: 'repo_1', githubRepoUrl: 'https://github.com/Acme/fair-split' };

function database(existingBounties = 0) {
  return {
    githubRepo: { findFirst: jest.fn().mockResolvedValue(REPO_ROW) },
    issue: { count: jest.fn().mockResolvedValue(existingBounties) },
  } as unknown as PrismaClient;
}

const answer = (body: unknown, status = 201) => jest.fn().mockResolvedValue(new Response(JSON.stringify(body), { status }));
const deps = (db: PrismaClient, fetchFn: typeof fetch) => ({ db, org: 'Acme', apiUrl: 'http://api.test', scenario, fetchFn, log: jest.fn() });

describe('createBounty', () => {
  it('posts the scenario to the API the way the web form does', async () => {
    const fetchFn = answer({ id: 'i1', githubIssueNumber: 12, githubIssueUrl: 'https://github.com/Acme/fair-split/issues/12', escrowSignature: 'sig' });

    const created = await createBounty(deps(database(), fetchFn as unknown as typeof fetch));

    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe('http://api.test/api/issue');
    const sent = JSON.parse(init.body);
    expect(sent).toMatchObject({
      title: scenario.bounty.title,
      rewardAmount: '50000000',
      repoId: 'repo_1',
      labels: ['bug', 'good first issue'],
    });
    expect(sent.body).toBe(issueBody(scenario));
    expect(created).toEqual({ number: 12, url: 'https://github.com/Acme/fair-split/issues/12', escrowSignature: 'sig' });
  });

  it('refuses when a bounty is already there, so a take cannot lock a second reward', async () => {
    const fetchFn = answer({});
    await expect(createBounty(deps(database(1), fetchFn as unknown as typeof fetch))).rejects.toThrow('demo:reset');
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('reports what the API answered when it refuses', async () => {
    const fetchFn = answer({ message: 'SERVER_WALLET_KEYPAIR_B64 is not set' }, 503);
    await expect(createBounty(deps(database(), fetchFn as unknown as typeof fetch))).rejects.toThrow('503');
  });

  it('points at the retry endpoint when the reward is locked but GitHub refused the issue', async () => {
    const fetchFn = answer({ id: 'i1', githubIssueNumber: null, githubIssueUrl: null, escrowSignature: 'sig' });
    await expect(createBounty(deps(database(), fetchFn as unknown as typeof fetch))).rejects.toThrow('/api/issue/i1/github');
  });

  it('says the API is unreachable instead of showing a bare "fetch failed"', async () => {
    const fetchFn = jest.fn().mockRejectedValue(new TypeError('fetch failed'));
    const run = createBounty(deps(database(), fetchFn as unknown as typeof fetch));
    await expect(run).rejects.toThrow(UsageError);
    await expect(run).rejects.toThrow('http://api.test');
  });
});
