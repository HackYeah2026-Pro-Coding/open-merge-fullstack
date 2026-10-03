import type { ReviewSource } from '@escrow/shared';
import { COMMENT_MARKER } from './github-review.client';
import { renderComment } from './pr-comment';
import type { ReviewOutput } from './review-output';
import type { ReviewerOutcome } from './verdict';

const output = (over: Partial<ReviewOutput> = {}): ReviewOutput => ({
  verdict: 'approve',
  confidence: 'high',
  criteria: [{ criterion: 'Trims the email', status: 'met', evidence: 'src/login.ts:14' }],
  risks: [],
  developerFeedback: 'Nice, the fix is focused.',
  maintainerSummary: 'Solves the issue.',
  ...over,
});
const ok = (reviewer: 'claude' | 'gemini', out: ReviewOutput, model = `${reviewer}-model`, sources: ReviewSource[] = []): ReviewerOutcome => ({
  reviewer,
  ok: true,
  answer: { output: out, model, inputTokens: 1, outputTokens: 1, sources },
});

describe('renderComment', () => {
  const base = { headSha: 'abcdef1234567890', ci: { state: 'passed' as const, failedJobs: [] } };

  it('starts with the marker later runs use to find and edit the comment', () => {
    expect(renderComment({ ...base, outcomes: [ok('claude', output()), ok('gemini', output())] }).startsWith(COMMENT_MARKER)).toBe(true);
  });

  it('shows both reviewers, the criteria table, the short commit and that the decision is the maintainer’s', () => {
    const text = renderComment({ ...base, outcomes: [ok('claude', output()), ok('gemini', output())] });
    expect(text).toContain('review of `abcdef1`');
    expect(text).toContain('Both reviewers approve');
    expect(text).toContain('### Claude');
    expect(text).toContain('### Gemini');
    expect(text).toContain('| ✅ | Trims the email | src/login.ts:14 |');
    expect(text).toContain('Advisory only');
    expect(text).toContain('claude-model and gemini-model');
  });

  it('asks for changes when a reviewer does, and lists risks', () => {
    const text = renderComment({
      ...base,
      outcomes: [ok('claude', output({ verdict: 'changes', risks: ['Breaks the signup form'] })), ok('gemini', output())],
    });
    expect(text).toContain('Changes are needed');
    expect(text).toContain('Requests changes');
    expect(text).toContain('- Breaks the signup form');
  });

  it('says what failed in CI and does not call a review with red CI an approval', () => {
    const text = renderComment({
      ci: { state: 'failed', failedJobs: ['test (node 22)'] },
      headSha: 'abcdef1234567890',
      outcomes: [ok('claude', output()), ok('gemini', output())],
    });
    expect(text).toContain('CI: failed (test (node 22)).');
    expect(text).toContain('Changes are needed');
  });

  it('reports a reviewer that gave no answer instead of hiding it', () => {
    const text = renderComment({
      ...base,
      outcomes: [ok('claude', output()), { reviewer: 'gemini', ok: false, error: 'quota exceeded' }],
    });
    expect(text).toContain('could not be completed');
    expect(text).toContain('No answer: quota exceeded');
  });

  it('says what each reviewer read in the repository, without repeats, and how many calls failed', () => {
    const sources: ReviewSource[] = [
      { tool: 'read_file', target: 'src/login.ts', ok: true },
      { tool: 'search', target: 'trimEmail', ok: true },
      { tool: 'read_file', target: 'src/login.ts', ok: true },
      { tool: 'read_file', target: 'src/gone.ts', ok: false },
      { tool: 'list_dir', target: 'test', ok: true },
    ];
    const text = renderComment({ ...base, outcomes: [ok('claude', output(), 'claude-model', sources), ok('gemini', output())] });
    expect(text).toContain('Tools: read `src/login.ts`; searched for `trimEmail`; listed `test`. 1 tool call failed.');
    expect(text.match(/^Tools:/gm)).toHaveLength(1);
  });

  it('keeps model-chosen search text from breaking out of its code span, and shortens long lists', () => {
    const many: ReviewSource[] = Array.from({ length: 15 }, (_, i) => ({ tool: 'read_file', target: `f${i}.ts`, ok: true }));
    const text = renderComment({
      ...base,
      outcomes: [ok('claude', output(), 'm', [{ tool: 'search', target: 'a`b\nc', ok: true }, ...many]), ok('gemini', output())],
    });
    expect(text).toContain('searched for `a b c`');
    expect(text).toContain('`f11.ts` and 3 more');
  });

  it('keeps table cells on one line and escapes pipes', () => {
    const text = renderComment({
      ...base,
      outcomes: [
        ok('claude', output({ criteria: [{ criterion: 'a | b\nc', status: 'unknown', evidence: 'none' }] })),
        ok('gemini', output()),
      ],
    });
    expect(text).toContain('| ❔ | a \\| b c | none |');
  });
});
