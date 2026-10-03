import { overallState, toCommitStatus } from './verdict';

describe('overallState', () => {
  it.each([
    [['approve', 'approve'], 'passed', 'passed'],
    [['approve', 'approve'], 'none', 'passed'],
    [['approve', 'approve'], 'timeout', 'passed'],
    [['approve', 'approve'], 'failed', 'failed'],
    [['approve', 'changes'], 'passed', 'failed'],
    [['changes', 'changes'], 'passed', 'failed'],
    [['approve', null], 'passed', 'error'],
    [[null, null], 'failed', 'error'],
    [['changes', null], 'passed', 'error'],
  ] as const)('verdicts %j with CI %s is %s', (verdicts, ci, expected) => {
    expect(overallState([...verdicts], ci)).toBe(expected);
  });
});

describe('toCommitStatus', () => {
  it('maps to the states GitHub accepts', () => {
    expect(toCommitStatus('passed')).toBe('success');
    expect(toCommitStatus('failed')).toBe('failure');
    expect(toCommitStatus('error')).toBe('error');
  });
});
