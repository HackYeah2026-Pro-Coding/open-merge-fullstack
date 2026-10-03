import { BadGatewayException, ServiceUnavailableException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env';
import { DownloadTooLargeError, GithubService } from './github.service';

describe('GithubService.createIssue', () => {
  const ref = { owner: 'acme', repo: 'widgets' };
  const issue = { title: 'Fix it', body: 'Details' };

  function setup(token: string | undefined) {
    const config = { get: jest.fn().mockReturnValue(token) };
    const fetchMock = jest.spyOn(globalThis, 'fetch');
    const service = new GithubService(config as unknown as ConfigService<Env, true>);
    return { service, fetchMock };
  }

  afterEach(() => jest.restoreAllMocks());

  it('posts the issue with the token and returns its number and URL', async () => {
    const { service, fetchMock } = setup('secret');
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ number: 42, html_url: 'https://github.com/acme/widgets/issues/42' }), {
        status: 201,
      }),
    );

    await expect(service.createIssue(ref, issue)).resolves.toEqual({
      number: 42,
      htmlUrl: 'https://github.com/acme/widgets/issues/42',
    });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.github.com/repos/acme/widgets/issues');
    expect(init?.method).toBe('POST');
    expect(init?.body).toBe(JSON.stringify(issue));
    expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer secret');
  });

  it('refuses without a token and does not call GitHub', async () => {
    const { service, fetchMock } = setup(undefined);

    await expect(service.createIssue(ref, issue)).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reports a GitHub error as a bad gateway', async () => {
    const { service, fetchMock } = setup('secret');
    fetchMock.mockResolvedValue(new Response('{"message":"Issues are disabled"}', { status: 410 }));

    await expect(service.createIssue(ref, issue)).rejects.toBeInstanceOf(BadGatewayException);
  });
});

describe('GithubService.request', () => {
  function setup() {
    const config = { get: jest.fn().mockReturnValue('secret') };
    const fetchMock = jest.spyOn(globalThis, 'fetch');
    return { service: new GithubService(config as unknown as ConfigService<Env, true>), fetchMock };
  }

  afterEach(() => jest.restoreAllMocks());

  it('names GitHub\'s message instead of echoing the JSON body', async () => {
    const { service, fetchMock } = setup();
    fetchMock.mockResolvedValue(
      new Response('{"message":"No commit found for SHA: abc","documentation_url":"https://docs.github.com/rest","status":"422"}', {
        status: 422,
      }),
    );
    await expect(service.request('POST', '/repos/acme/widgets/statuses/abc', {})).rejects.toThrow(
      new BadGatewayException('GitHub returned 422 for POST /repos/acme/widgets/statuses/abc: No commit found for SHA: abc'),
    );
  });

  it('keeps the start of a body that is not JSON', async () => {
    const { service, fetchMock } = setup();
    fetchMock.mockResolvedValue(new Response('<html>Bad gateway</html>', { status: 502 }));
    await expect(service.request('GET', '/repos/acme/widgets')).rejects.toThrow(
      'GitHub returned 502 for GET /repos/acme/widgets: <html>Bad gateway</html>',
    );
  });

  it('resolves a 204 to undefined and parses other answers', async () => {
    const { service, fetchMock } = setup();
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    await expect(service.request('DELETE', '/x')).resolves.toBeUndefined();
    fetchMock.mockResolvedValueOnce(new Response('{"id":7,"state":"success"}', { status: 201 }));
    await expect(service.request('POST', '/repos/acme/widgets/statuses/abc', {})).resolves.toEqual({ id: 7, state: 'success' });
  });
});

describe('GithubService.download', () => {
  function setup() {
    const config = { get: jest.fn().mockReturnValue('secret') };
    const fetchMock = jest.spyOn(globalThis, 'fetch');
    return { service: new GithubService(config as unknown as ConfigService<Env, true>), fetchMock };
  }
  /** A body that arrives in chunks without announcing its length, and records how much was pulled. */
  function streamed(chunks: number[]) {
    let pulled = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        const next = chunks[pulled++];
        if (next === undefined) controller.close();
        else controller.enqueue(new Uint8Array(next).fill(7));
      },
    });
    return { body, pulled: () => pulled };
  }

  afterEach(() => jest.restoreAllMocks());

  it('returns the bytes of the answer, authenticated', async () => {
    const { service, fetchMock } = setup();
    fetchMock.mockResolvedValue(new Response(new Uint8Array([1, 2, 3])));
    await expect(service.download('/repos/acme/widgets/tarball/abc', 10)).resolves.toEqual(Buffer.from([1, 2, 3]));
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.github.com/repos/acme/widgets/tarball/abc');
    expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer secret');
  });

  it('refuses an answer whose announced length is over the limit without reading it', async () => {
    const { service, fetchMock } = setup();
    const { body, pulled } = streamed([4, 4]);
    fetchMock.mockResolvedValue(new Response(body, { headers: { 'content-length': '11' } }));
    await expect(service.download('/t', 10)).rejects.toBeInstanceOf(DownloadTooLargeError);
    expect(pulled()).toBeLessThanOrEqual(1);
  });

  it('stops reading a body without a length as soon as it passes the limit', async () => {
    const { service, fetchMock } = setup();
    const { body, pulled } = streamed([6, 6, 6, 6]);
    fetchMock.mockResolvedValue(new Response(body));
    await expect(service.download('/t', 10)).rejects.toThrow('larger than');
    expect(pulled()).toBeLessThan(4);
  });

  it('reports GitHub errors with their message', async () => {
    const { service, fetchMock } = setup();
    fetchMock.mockResolvedValue(new Response('{"message":"Not Found"}', { status: 404 }));
    await expect(service.download('/repos/acme/widgets/tarball/abc', 10)).rejects.toThrow(
      new BadGatewayException('GitHub returned 404 for GET /repos/acme/widgets/tarball/abc: Not Found'),
    );
  });
});
