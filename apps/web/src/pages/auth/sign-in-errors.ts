import type { SignInError } from '@escrow/shared';

const MESSAGES: Record<SignInError, string> = {
  access_denied: 'GitHub sign-in was cancelled.',
  state_mismatch: 'The sign-in link expired. Try again.',
  github: 'GitHub did not confirm the sign-in. Try again.',
};

/** What to show when GitHub sign-in sends the browser back with `?error=`; null when it did not. */
export function signInErrorMessage(code: string | null): string | null {
  if (!code) return null;
  return Object.hasOwn(MESSAGES, code) ? MESSAGES[code as SignInError] : 'Sign-in failed. Try again.';
}
