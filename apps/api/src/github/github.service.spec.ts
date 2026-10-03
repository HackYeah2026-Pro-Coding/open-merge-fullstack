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
