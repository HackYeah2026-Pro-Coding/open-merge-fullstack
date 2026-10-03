import type { CiResult, CommitCheck, ReviewCriterion, ReviewerVerdict, ReviewVerdict } from '@escrow/shared';

type ReviewerName = 'Claude' | 'Gemini';

const MODEL: Record<ReviewerName, string> = { Claude: 'claude-opus-5-5', Gemini: 'gemini-pro' };

const MET: ReviewCriterion[] = [
  { criterion: 'The behaviour described in the issue is implemented', status: 'met', evidence: 'src/index.ts:42' },
  { criterion: 'A test covers the new behaviour', status: 'met', evidence: 'CI job "test"' },
];

/** What the mock reviewers say for a verdict. Real answers come from the API. */
export function reviewer(name: ReviewerName, verdict: ReviewVerdict, summary: string | null): ReviewerVerdict {
  const answered = verdict === 'approve' || verdict === 'changes';
  return {
    reviewer: name,
    verdict,
    summary,
    model: answered ? MODEL[name] : null,
    confidence: answered ? 'high' : null,
    criteria:
      verdict === 'approve'
        ? MET
        : verdict === 'changes'
          ? [MET[0], { criterion: 'Edge cases from the issue are handled', status: 'not_met', evidence: summary ?? 'see summary' }]
          : [],
    risks: verdict === 'changes' && summary ? [summary] : [],
  };
}

export function checkOf(claude: ReviewerVerdict, gemini: ReviewerVerdict): CommitCheck {
  const verdicts = [claude.verdict, gemini.verdict];
  const state = verdicts.includes('error')
    ? 'error'
    : verdicts.includes('pending')
      ? 'pending'
      : verdicts.every((v) => v === 'approve')
        ? 'passed'
        : 'failed';
  return { state, reviewers: [claude, gemini] };
}

export const CI_PASSED: CiResult = { state: 'passed', failedJobs: [] };
