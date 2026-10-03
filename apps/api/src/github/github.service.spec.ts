import { BadGatewayException, ServiceUnavailableException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env';
import { GithubService } from './github.service';

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
