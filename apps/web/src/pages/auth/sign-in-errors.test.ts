import { describe, expect, it } from 'vitest';
import { signInErrorMessage } from './sign-in-errors';

describe('signInErrorMessage', () => {
  it('is null without an error', () => {
    expect(signInErrorMessage(null)).toBeNull();
    expect(signInErrorMessage('')).toBeNull();
  });

  it('explains each error the API sends', () => {
    expect(signInErrorMessage('access_denied')).toBe('GitHub sign-in was cancelled.');
    expect(signInErrorMessage('state_mismatch')).toBe('The sign-in link expired. Try again.');
    expect(signInErrorMessage('github')).toBe('GitHub did not confirm the sign-in. Try again.');
  });

  it('falls back for unknown codes, including inherited object keys', () => {
    expect(signInErrorMessage('something_new')).toBe('Sign-in failed. Try again.');
    expect(signInErrorMessage('toString')).toBe('Sign-in failed. Try again.');
  });
});
