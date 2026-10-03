import type { CiState } from '../generated/prisma/enums';
import { COMMENT_MARKER } from './github-review.client';
import type { ReviewerOutcome } from './verdict';
import { overallState, verdictOf } from './verdict';

export interface CommentInput {
  headSha: string;
  ci: { state: CiState; failedJobs: string[] };
  outcomes: ReviewerOutcome[];
}

const NAME: Record<string, string> = { claude: 'Claude', gemini: 'Gemini' };
const CRITERION_ICON = { met: '✅', not_met: '❌', unknown: '❔' } as const;
const HEADLINE = {
  passed: '**Both reviewers approve this change.**',
  failed: '**Changes are needed before this solves the issue.**',
  error: '**The review could not be completed.** At least one reviewer gave no answer.',
} as const;

/** Table cells cannot hold newlines or bare pipes. */
const cell = (text: string) => text.replaceAll('|', '\\|').replace(/\s*\n\s*/g, ' ');

function ciLine(ci: CommentInput['ci']): string {
  switch (ci.state) {
    case 'passed':
      return 'CI: passed.';
    case 'failed':
      return `CI: failed (${ci.failedJobs.join(', ')}).`;
    case 'none':
      return 'CI: none found for this commit, so nothing was executed.';
    case 'timeout':
      return 'CI: still running when the review started, so nothing was executed.';
  }
}

/** The PR comment for the developer. Edited in place on every push. */
export function renderComment({ headSha, ci, outcomes }: CommentInput): string {
  const lines = [COMMENT_MARKER, `## OpenMerge review of \`${headSha.slice(0, 7)}\``, '', HEADLINE[overallState(outcomes.map(verdictOf), ci.state)], '', ciLine(ci)];

  for (const outcome of outcomes) {
    lines.push('', `### ${NAME[outcome.reviewer] ?? outcome.reviewer}`);
    if (!outcome.ok) {
      lines.push(`No answer: ${outcome.error}`);
      continue;
    }
    const { output } = outcome.answer;
    lines.push(
      `${output.verdict === 'approve' ? 'Approves' : 'Requests changes'} (confidence: ${output.confidence}).`,
      '',
      output.developerFeedback,
    );
    if (output.criteria.length > 0) {
      lines.push('', '| | Criterion | Evidence |', '|---|---|---|');
      for (const c of output.criteria) lines.push(`| ${CRITERION_ICON[c.status]} | ${cell(c.criterion)} | ${cell(c.evidence)} |`);
    }
    if (output.risks.length > 0) lines.push('', 'Risks:', ...output.risks.map((r) => `- ${r}`));
  }

  const used = outcomes.flatMap((o) => (o.ok ? [o.answer.model] : []));
  lines.push(
    '',
    '---',
    `<sub>Advisory only: the maintainer decides whether to merge. Reviewed by ${used.length > 0 ? used.join(' and ') : 'no model'}.</sub>`,
  );
  return lines.join('\n');
}
