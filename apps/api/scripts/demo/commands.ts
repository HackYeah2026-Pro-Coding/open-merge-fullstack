import { createBounty } from './bounty';
import { connectDb, describeDbTarget } from './db';
import { loadDemoEnv, requireToken, type DemoEnv } from './env';
import { UsageError } from './errors';
import { loadFiller } from './filler-data';
import { runFiller } from './filler';
import { GithubClient } from './github-api';
import { log } from './log';
import { ORPHANED_ESCROWS_FILE } from './paths';
import { prepare } from './prepare';
import { publish } from './publish';
import { mergePullRequest, openPullRequest, pushFix } from './pull-request';
import { reset } from './reset';
import { DEFAULT_WAIT } from './review-status';
import { loadScenario } from './scenario';
import { collectStatus, formatStatus } from './status';
import type { PrismaClient } from '../../src/generated/prisma/client';

export const COMMANDS = ['prepare', 'publish', 'reset', 'bounty', 'pr', 'fix', 'merge', 'status', 'filler'] as const;
export type Command = (typeof COMMANDS)[number];

export const isCommand = (value: string | undefined): value is Command => COMMANDS.includes(value as Command);

export const USAGE = `Usage: pnpm demo:<command> [flags]

Live presentation:
  prepare --yes     before every take: re-create the live repo and its twin, each with the fix on a branch

Full take on one repo:
  publish --yes     create or refresh the demo repo and pin its three code states (once, or when demo/repo changes)
  reset --yes       back to "before step 1": no bounty or pull request, main at the baseline
  bounty            step 1 fallback: create the bounty through the API
  pr                step 3: the developer opens the pull request with the first, incomplete fix
  fix [--now]       step 5: wait for that review to end, then push the finished fix (--now skips the wait)
  merge             step 7 fallback: the maintainer merges
  status            where the demo stands and what to do next
  filler            fill the dashboard with example repos and bounties

Tokens and setup: demo/README.md`;

export interface RunOptions {
  yes: boolean;
  /** For "fix": do not wait for the first review to finish. */
  now: boolean;
  /** For "fix": seconds to wait for the review. */
  timeoutSeconds: number | null;
}

function requireYes(yes: boolean, lines: string[]): void {
  if (yes) return;
  throw new UsageError([...lines, '', 'Nothing was changed. Run it again with --yes to continue.'].join('\n'));
}

async function withDb<T>(action: (db: PrismaClient) => Promise<T>): Promise<T> {
  log(`Database: ${describeDbTarget()}`);
  const db = connectDb();
  try {
    return await action(db);
  } finally {
    await db.$disconnect();
  }
}

/** The first token that can read the repository, for commands that only look. */
function readClient(env: DemoEnv): GithubClient {
  const token = env.tokens.admin ?? env.tokens.dev ?? env.tokens.bot;
  if (!token) throw new UsageError('Set DEMO_ADMIN_TOKEN, DEMO_DEV_TOKEN or GITHUB_TOKEN in .env. See demo/README.md.');
  return new GithubClient(token);
}

export async function runCommand(command: Command, options: RunOptions): Promise<void> {
  const env = loadDemoEnv();
  const scenario = loadScenario();
  const { org } = env;
  const slug = `${org}/${scenario.repo.name}`;

  switch (command) {
    case 'prepare': {
      requireYes(options.yes, [
        `Database: ${describeDbTarget()}`,
        `This DELETES the GitHub repositories ${slug} and ${org}/${scenario.live.twinRepo} with all their issues and pull requests`,
        'and creates them again, removes their bounties from the database, and locks a new reward for the twin.',
      ]);
      const admin = new GithubClient(requireToken(env, 'admin'));
      const dev = new GithubClient(requireToken(env, 'dev'));
      const bot = new GithubClient(requireToken(env, 'bot'));
      await withDb((db) =>
        prepare({
          db,
          admin,
          dev,
          bot,
          org,
          scenario,
          apiUrl: env.apiUrl,
          webUrl: env.webUrl,
          orphanFile: ORPHANED_ESCROWS_FILE,
          sleep: DEFAULT_WAIT.sleep,
          log,
        }),
      );
      return;
    }
    case 'publish': {
      requireYes(options.yes, [
        `This force-moves the default branch of ${slug} to the baseline and re-points the tags`,
        `${scenario.refs.baseline}, ${scenario.refs.v1} and ${scenario.refs.v2}. The repository is created if it does not exist.`,
      ]);
      const dev = env.tokens.dev ? new GithubClient(env.tokens.dev) : null;
      await publish({ admin: new GithubClient(requireToken(env, 'admin')), dev, org, scenario, log });
      return;
    }
    case 'reset': {
      requireYes(options.yes, [
        `Database: ${describeDbTarget()}`,
        `This deletes every bounty, pull request, review and payout of ${slug} from the database,`,
        'closes its pull requests, deletes its branches and issues on GitHub, and force-resets the default branch.',
      ]);
      const admin = new GithubClient(requireToken(env, 'admin'));
      await withDb((db) => reset({ db, admin, org, scenario, orphanFile: ORPHANED_ESCROWS_FILE, log }));
      return;
    }
    case 'bounty':
      await withDb((db) => createBounty({ db, org, apiUrl: env.apiUrl, scenario, log }));
      return;
    case 'pr': {
      const dev = new GithubClient(requireToken(env, 'dev'));
      await withDb((db) => openPullRequest({ db, dev, org, scenario, log }));
      return;
    }
    case 'fix': {
      const dev = new GithubClient(requireToken(env, 'dev'));
      const timeoutMs = options.timeoutSeconds === null ? DEFAULT_WAIT.timeoutMs : options.timeoutSeconds * 1000;
      await pushFix({ dev, org, scenario, wait: !options.now, waitOptions: { ...DEFAULT_WAIT, timeoutMs }, log });
      return;
    }
    case 'merge':
      await mergePullRequest({ admin: new GithubClient(requireToken(env, 'admin')), org, scenario, log });
      return;
    case 'status':
      await withDb(async (db) => {
        const status = await collectStatus({ db, api: readClient(env), org, scenario });
        for (const line of formatStatus(status)) log(line);
      });
      return;
    case 'filler': {
      const admin = new GithubClient(requireToken(env, 'admin'));
      const bot = new GithubClient(requireToken(env, 'bot'));
      await withDb((db) =>
        runFiller({ db, admin, bot, org, filler: loadFiller(), context: { now: new Date(), models: env.models }, log }),
      );
      return;
    }
  }
}
