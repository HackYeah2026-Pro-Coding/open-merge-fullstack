export const DEFAULT_NEXT = '/bounties';

/**
 * Only same-site paths are honoured, so `next` cannot bounce someone to another
 * origin. Mirrors safeNext on the web sign-in page; `/\` counts as `//` in browsers.
 */
export function safeNext(raw: unknown): string {
  const ok =
    typeof raw === 'string' &&
    raw.length <= 2048 &&
    raw.startsWith('/') &&
    !raw.startsWith('//') &&
    !raw.startsWith('/\\');
  return ok ? raw : DEFAULT_NEXT;
}
