const GITHUB_API = 'https://api.github.com';

/** The slice of the GitHub API the demo tools use; commands take it as a dependency so tests can fake it. */
export interface GithubApi {
  request<T>(method: string, path: string, body?: unknown): Promise<T>;
  /** Every page of a list endpoint. */
  requestAll<T>(path: string): Promise<T[]>;
  graphql<T>(query: string, variables: Record<string, unknown>): Promise<T>;
}

export class GithubHttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'GithubHttpError';
  }
}

/** True when GitHub answered with exactly this status. */
export function isHttpStatus(error: unknown, status: number): boolean {
  return error instanceof GithubHttpError && error.status === status;
}

/** GitHub's own explanation from an error body, or the start of the raw text. */
function githubMessage(text: string): string {
  try {
    const { message } = JSON.parse(text) as { message?: unknown };
    if (typeof message === 'string') return message;
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
  }
  return text.slice(0, 200);
}

/** One GitHub token, so each part of the demo (admin, developer, bot) acts as the account it should. */
export class GithubClient implements GithubApi {
  constructor(
    private readonly token: string,
    private readonly baseUrl: string = GITHUB_API,
  ) {}

  async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'OpenMerge-demo',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.token}`,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!response.ok) {
      const text = await response.text();
      throw new GithubHttpError(response.status, `GitHub returned ${response.status} for ${method} ${path}: ${githubMessage(text)}`);
    }
    return (response.status === 204 ? undefined : await response.json()) as T;
  }

  async requestAll<T>(path: string): Promise<T[]> {
    const items: T[] = [];
    const separator = path.includes('?') ? '&' : '?';
    for (let page = 1; ; page++) {
      const batch = await this.request<T[]>('GET', `${path}${separator}per_page=100&page=${page}`);
      items.push(...batch);
      if (batch.length < 100) return items;
    }
  }

  /** GitHub reports GraphQL failures with a 200 and an `errors` list. */
  async graphql<T>(query: string, variables: Record<string, unknown>): Promise<T> {
    const result = await this.request<{ data?: T; errors?: { message: string }[] }>('POST', '/graphql', { query, variables });
    if (result.errors?.length) {
      throw new Error(`GitHub GraphQL error: ${result.errors.map((e) => e.message).join('; ')}`);
    }
    return result.data as T;
  }
}
