import type { PrismaClient } from '../../src/generated/prisma/client';
import { UsageError } from './errors';
import type { Log } from './log';
import { toBaseUnits } from './reward';
import { requireRepoRow } from './rows';
import { issueBody, type Scenario } from './scenario';

export interface BountyDeps {
  db: PrismaClient;
  org: string;
  /** Base URL of the running API. */
  apiUrl: string;
  scenario: Scenario;
  /** Repository of the organization to put the bounty on; the scenario's repo when absent. */
  repoName?: string;
  fetchFn?: typeof fetch;
  log: Log;
}

export interface CreatedBounty {
  number: number;
  url: string;
  escrowSignature: string | null;
}

interface IssueResponse {
  id: string;
  githubIssueNumber: number | null;
  githubIssueUrl: string | null;
  escrowSignature: string | null;
}

/**
 * Creates the demo bounty through the API, exactly as the web form does: the reward is locked
 * on chain and the issue is opened on GitHub. The stand-in for step 1 when the form misbehaves.
 */
export async function createBounty(deps: BountyDeps): Promise<CreatedBounty> {
  const { db, org, apiUrl, scenario, log } = deps;
  const fetchFn = deps.fetchFn ?? fetch;
  const repo = await requireRepoRow(db, org, deps.repoName ?? scenario.repo.name);

  if ((await db.issue.count({ where: { githubRepoId: repo.id } })) > 0) {
    throw new UsageError('The demo repo already has a bounty. Run: pnpm demo:reset --yes');
  }

  const { bounty } = scenario;
  let response: Response;
  try {
    response = await fetchFn(`${apiUrl}/api/issue`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: bounty.title,
        body: issueBody(scenario),
        rewardAmount: toBaseUnits(bounty.rewardTokens).toString(),
        repoId: repo.id,
        labels: bounty.labels,
      }),
    });
  } catch (error) {
    // fetch rejects with a TypeError when nothing answers; every other error is a bug and keeps its stack.
    if (error instanceof TypeError) throw new UsageError(`Could not reach the API at ${apiUrl}. Is it running? (${error.message})`, { cause: error });
    throw error;
  }
  if (!response.ok) throw new Error(`POST ${apiUrl}/api/issue answered ${response.status}: ${(await response.text()).slice(0, 300)}`);

  const issue = (await response.json()) as IssueResponse;
  if (issue.githubIssueNumber === null || issue.githubIssueUrl === null) {
    throw new Error(
      `The reward is locked and the bounty is saved, but opening the GitHub issue failed. Retry it: POST ${apiUrl}/api/issue/${issue.id}/github`,
    );
  }
  log(`Bounty created: issue #${issue.githubIssueNumber} ${issue.githubIssueUrl}`);
  if (issue.escrowSignature) log(`Escrow funded, tx ${issue.escrowSignature}`);
  return { number: issue.githubIssueNumber, url: issue.githubIssueUrl, escrowSignature: issue.escrowSignature };
}
