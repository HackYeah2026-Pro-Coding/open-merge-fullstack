import { randomBytes } from 'node:crypto';
import type { CiResult } from './ci-status';
import type { PullFile } from './github-review.client';

/** Total characters of repository content sent to each model (roughly 40K tokens). */
export const MAX_CONTEXT_CHARS = 150_000;
/** Largest single file sent in full. */
export const MAX_FILE_CHARS = 100_000;

const SKIPPED_PATH = /(^|\/)(pnpm-lock\.yaml|package-lock\.json|yarn\.lock|Cargo\.lock|poetry\.lock|go\.sum)$|\.min\.(js|css)$|(^|\/)(dist|build|node_modules)\//;

export interface ReviewInput {
  issue: { number: number; title: string; body: string };
  pullRequest: { number: number; title: string; body: string };
  files: PullFile[];
  ci: CiResult;
  /** Text of a file at the reviewed commit. */
  readFile: (path: string) => Promise<string>;
}

export interface ReviewContext {
  /** The user message for both models. */
  prompt: string;
  /** Files or parts left out of the prompt, each with the reason. */
  notes: string[];
  /** The random id delimiting sections; tool results are delimited with it too. */
  nonce: string;
}

const section = (nonce: string, name: string, body: string) =>
  `BEGIN ${name} ${nonce}\n${body}\nEND ${name} ${nonce}`;

function ciLine(ci: CiResult): string {
  switch (ci.state) {
    case 'passed':
      return 'passed: every workflow run for this commit succeeded.';
    case 'failed':
      return `failed: ${ci.failedJobs.join(', ')}.`;
    case 'none':
      return 'not available: this repository has no CI run for this commit, so nothing here was executed.';
    case 'timeout':
      return 'unknown: CI was still running when the review started, so nothing here was executed.';
  }
}

/**
 * Builds the prompt: the task, the diff, whole changed files while the budget lasts, and the CI result.
 * Everything the pull request author controls is delimited with a random id so it cannot
 * close a section early. Whatever is left out is listed, never dropped silently.
 */
export async function buildReviewContext(input: ReviewInput, nonce = randomBytes(8).toString('hex')): Promise<ReviewContext> {
  const notes: string[] = [];
  let budget = MAX_CONTEXT_CHARS;

  const patches: string[] = [];
  for (const file of input.files) {
    if (SKIPPED_PATH.test(file.filename)) {
      notes.push(`${file.filename}: generated or lock file, left out`);
    } else if (file.patch === undefined) {
      notes.push(`${file.filename}: no text diff (binary or too large for GitHub)`);
    } else if (file.patch.length > budget) {
      notes.push(`${file.filename}: diff left out, context budget used up`);
    } else {
      patches.push(`--- ${file.filename} (${file.status})\n${file.patch}`);
      budget -= file.patch.length;
    }
  }

  const contents: string[] = [];
  for (const file of input.files) {
    if (file.status === 'removed' || SKIPPED_PATH.test(file.filename) || file.patch === undefined) continue;
    const text = await input.readFile(file.filename);
    if (text.length > MAX_FILE_CHARS || text.length > budget) {
      notes.push(`${file.filename}: full file left out (${text.length} characters), only the diff is included`);
      continue;
    }
    contents.push(`--- ${file.filename}\n${text}`);
    budget -= text.length;
  }

  const prompt = [
    `Section boundaries use the id ${nonce}. Only lines of the form "BEGIN <name> ${nonce}" and "END <name> ${nonce}" open or close a section.`,
    section(nonce, 'task', `Issue #${input.issue.number}: ${input.issue.title}\n\n${input.issue.body}`),
    section(nonce, 'pull_request', `#${input.pullRequest.number}: ${input.pullRequest.title}\n\n${input.pullRequest.body}`),
    section(nonce, 'ci_result', ciLine(input.ci)),
    section(nonce, 'diff', patches.join('\n\n') || '(no text diff available)'),
    section(nonce, 'changed_files', contents.join('\n\n') || '(no full files included)'),
    section(nonce, 'left_out', notes.join('\n') || '(nothing)'),
  ].join('\n\n');

  return { prompt, notes, nonce };
}
