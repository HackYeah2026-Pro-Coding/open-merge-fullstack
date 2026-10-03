import { GithubHttpError, type GithubApi } from './github-api';
import type { WaitOptions } from './review-status';

export interface Call {
  method: string;
  path: string;
  body?: unknown;
}

type Handler = (call: Call) => unknown;

/** Throws what GitHub answers for a missing thing; use it as a route answer. */
export const notFound = (): never => {
  throw new GithubHttpError(404, 'Not Found');
};

/**
 * A GitHub for tests: answers from a route table (first pattern matching "METHOD path" wins),
 * records every call, and fails loudly on a call nobody expected.
 */
export class FakeGithub implements GithubApi {
  readonly calls: Call[] = [];

  constructor(private readonly routes: [RegExp, unknown][]) {}

  async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const call: Call = { method, path, body };
    this.calls.push(call);
    const route = this.routes.find(([pattern]) => pattern.test(`${method} ${path}`));
    if (!route) throw new Error(`Unexpected GitHub call: ${method} ${path}`);
    const [, answer] = route;
    return (typeof answer === 'function' ? (answer as Handler)(call) : answer) as T;
  }

  requestAll<T>(path: string): Promise<T[]> {
    return this.request<T[]>('GET', path);
  }

  graphql<T>(query: string, variables: Record<string, unknown>): Promise<T> {
    return this.request<T>('POST', '/graphql', { query, variables });
  }

  /** The recorded calls whose "METHOD path" matches. */
  called(pattern: RegExp): Call[] {
    return this.calls.filter((call) => pattern.test(`${call.method} ${call.path}`));
  }
}

/** A clock that only moves when the code sleeps, so waiting is instant and countable. */
export function fakeWait(timeoutMs = 60_000): WaitOptions & { slept: number[] } {
  let now = 0;
  const slept: number[] = [];
  return {
    pollMs: 5_000,
    timeoutMs,
    slept,
    now: () => now,
    sleep: async (ms) => {
      slept.push(ms);
      now += ms;
    },
  };
}
