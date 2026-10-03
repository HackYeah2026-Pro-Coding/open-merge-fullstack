import { GithubClient, GithubHttpError, isHttpStatus } from './github-api';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe('GithubClient', () => {
  let fetchMock: jest.SpiedFunction<typeof fetch>;

  beforeEach(() => {
    fetchMock = jest.spyOn(globalThis, 'fetch');
  });
  afterEach(() => {
    fetchMock.mockRestore();
  });

  it('sends the token and the JSON body', async () => {
    fetchMock.mockResolvedValueOnce(json({ ok: true }));
    await new GithubClient('secret', 'https://gh.test').request('POST', '/repos/o/r/issues', { title: 'x' });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://gh.test/repos/o/r/issues');
    expect(init?.method).toBe('POST');
    expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer secret');
    expect(init?.body).toBe('{"title":"x"}');
  });

  it('resolves a 204 to undefined', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    await expect(new GithubClient('t').request('DELETE', '/x')).resolves.toBeUndefined();
  });

  it('turns an error answer into an error that carries the status and GitHub\'s message', async () => {
    fetchMock.mockResolvedValueOnce(json({ message: 'Not Found' }, 404));
    const error = await new GithubClient('t').request('GET', '/x').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(GithubHttpError);
    expect((error as Error).message).toContain('404 for GET /x: Not Found');
    expect(isHttpStatus(error, 404)).toBe(true);
    expect(isHttpStatus(error, 500)).toBe(false);
  });

  it('keeps the start of a body that is not JSON', async () => {
    fetchMock.mockResolvedValueOnce(new Response('<html>bad gateway</html>', { status: 502 }));
    await expect(new GithubClient('t').request('GET', '/x')).rejects.toThrow('<html>bad gateway</html>');
  });

  it('reads every page of a list', async () => {
    const page1 = Array.from({ length: 100 }, (_, i) => i);
    fetchMock.mockResolvedValueOnce(json(page1)).mockResolvedValueOnce(json([100, 101]));

    const items = await new GithubClient('t', 'https://gh.test').requestAll<number>('/list?state=all');

    expect(items).toHaveLength(102);
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      'https://gh.test/list?state=all&per_page=100&page=1',
      'https://gh.test/list?state=all&per_page=100&page=2',
    ]);
  });

  it('reports GraphQL errors, which GitHub sends with a 200', async () => {
    fetchMock.mockResolvedValueOnce(json({ errors: [{ message: 'Resource not accessible' }] }));
    await expect(new GithubClient('t').graphql('query {}', {})).rejects.toThrow('Resource not accessible');
  });
});
