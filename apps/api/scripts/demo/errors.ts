/**
 * A condition the operator can fix (missing token, repo not published, no --yes).
 * The CLI prints its message without a stack trace; every other error keeps its stack.
 */
export class UsageError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'UsageError';
  }
}
