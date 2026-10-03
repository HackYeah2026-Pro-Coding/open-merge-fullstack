import { STATUS_CONTEXT } from '../../src/review/github-review.client';
import { FakeGithub, fakeWait } from './fake-github';
import { REVIEW_STATUS_CONTEXT, reviewStatusOf, waitForReview } from './review-status';

const status = (state: string, description = '', context = REVIEW_STATUS_CONTEXT) => ({ context, state, description });

describe('REVIEW_STATUS_CONTEXT', () => {
  it('is the name the API gives its commit status, or the demo would wait for a status that never comes', () => {
    expect(REVIEW_STATUS_CONTEXT).toBe(STATUS_CONTEXT);
  });
});

describe('reviewStatusOf', () => {
  it('ignores statuses of other tools', async () => {
    const api = new FakeGithub([[/statuses/, [status('success', 'ok', 'ci/other'), status('failure', 'Changes requested')]]]);
    await expect(reviewStatusOf(api, '/repos/o/r', 'abc')).resolves.toEqual({ state: 'failure', description: 'Changes requested' });
  });

  it('is null before the review has set anything', async () => {
    const api = new FakeGithub([[/statuses/, [status('success', '', 'ci/other')]]]);
    await expect(reviewStatusOf(api, '/repos/o/r', 'abc')).resolves.toBeNull();
  });
});

describe('waitForReview', () => {
  it('keeps polling through "not set yet" and "pending" until the review ends', async () => {
    const answers = [[], [status('pending')], [status('pending')], [status('failure', 'Changes requested by Claude and Gemini')]];
    const api = new FakeGithub([[/statuses/, () => answers.shift()]]);
    const wait = fakeWait();
    const log = jest.fn();

    const result = await waitForReview(api, '/repos/o/r', 'abcdef123', wait, log);

    expect(result).toEqual({ state: 'failure', description: 'Changes requested by Claude and Gemini' });
    expect(wait.slept).toHaveLength(3);
    expect(log).toHaveBeenCalledTimes(1);
  });

  it('gives up after the timeout instead of hanging a rehearsal', async () => {
    const api = new FakeGithub([[/statuses/, [status('pending')]]]);
    await expect(waitForReview(api, '/repos/o/r', 'abcdef123', fakeWait(20_000), jest.fn())).rejects.toThrow('did not finish within 20s');
  });
});
