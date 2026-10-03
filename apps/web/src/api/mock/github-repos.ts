import type { GithubRepository } from '@escrow/shared';
import { ApiError, type ApiClient } from '../client';
import { delay, getDb, saveDb } from './db';
import type { MockDb, MockRepository } from './types';
import { repositoryRef, toRepositorySummary } from './views';

const HOUR = 3_600_000;

interface MockGithubRepo extends MockRepository {
  archived: boolean;
  /** Hours since the latest push, null for an empty repository. */
  pushedHoursAgo: number | null;
}

/** Repositories of the mock organization that exist on GitHub but are not added by the seed. */
const ON_GITHUB_ONLY: MockGithubRepo[] = [
  {
    name: 'taskq-dashboard',
    description: 'Web UI for watching taskq queues and workers.',
    isPrivate: false,
    archived: false,
    pushedHoursAgo: 4,
  },
  { name: 'website', description: 'Marketing site and blog.', isPrivate: false, archived: false, pushedHoursAgo: 30 },
  {
    name: 'benchmarks',
    description: 'Throughput and latency benchmarks for taskq and fetchkit.',
    isPrivate: false,
    archived: false,
    pushedHoursAgo: 24 * 9,
  },
  { name: 'design-tokens', description: null, isPrivate: true, archived: false, pushedHoursAgo: null },
  {
    name: 'fetchkit-legacy',
    description: 'Version 1 of fetchkit, superseded by fetchkit.',
    isPrivate: false,
    archived: true,
    pushedHoursAgo: 24 * 400,
  },
];

/** What GitHub would list for the organization: the added repositories plus the ones above. */
function githubRepos(db: MockDb): MockGithubRepo[] {
  const extra = new Map(ON_GITHUB_ONLY.map((r) => [r.name, r]));
  const added = db.repositories.map((r, i) => extra.get(r.name) ?? { ...r, archived: false, pushedHoursAgo: 2 + i * 11 });
  return [...added, ...ON_GITHUB_ONLY.filter((r) => !db.repositories.some((a) => a.name === r.name))];
}

function requireOwnerView(): MockDb {
  const db = getDb();
  if (!db.ownerView) throw new ApiError(403, 'Open the owner view first.');
  return db;
}

/** Adding repositories from GitHub, merged into the mock client. */
export const githubRepoMockApi: Pick<ApiClient, 'listGithubRepositories' | 'addRepository'> = {
  async listGithubRepositories(): Promise<GithubRepository[]> {
    await delay();
    const db = requireOwnerView();
    const now = Date.now();
    return githubRepos(db)
      .map((r) => ({
        ...repositoryRef(r.name),
        description: r.description,
        isPrivate: r.isPrivate,
        archived: r.archived,
        pushedAt: r.pushedHoursAgo === null ? null : new Date(now - r.pushedHoursAgo * HOUR).toISOString(),
        added: db.repositories.some((a) => a.name === r.name),
      }))
      .sort((a, b) => (b.pushedAt ?? '').localeCompare(a.pushedAt ?? ''));
  },

  async addRepository(name) {
    await delay();
    const db = requireOwnerView();
    const found = githubRepos(db).find((r) => r.name.toLowerCase() === name.trim().toLowerCase());
    const { fullName } = repositoryRef(found?.name ?? name);
    if (!found) throw new ApiError(404, `Repository ${fullName} was not found on GitHub.`);
    if (found.archived) throw new ApiError(400, `${fullName} is archived on GitHub, so it cannot take new issues.`);
    if (db.repositories.some((r) => r.name === found.name)) throw new ApiError(409, `${fullName} is already added.`);

    const repo: MockRepository = { name: found.name, description: found.description, isPrivate: found.isPrivate };
    db.repositories.push(repo);
    db.nextNumber[repo.name] = 1;
    saveDb();
    return toRepositorySummary(repo, db.bounties);
  },
};
