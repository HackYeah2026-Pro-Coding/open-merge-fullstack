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
const ok = (reviewer: 'claude' | 'gemini', out: ReviewOutput, model = `${reviewer}-model`): ReviewerOutcome => ({
  reviewer,
  ok: true,
  answer: { output: out, model, inputTokens: 1, outputTokens: 1 },
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
