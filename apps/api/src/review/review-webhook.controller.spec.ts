import { createHmac } from 'node:crypto';
import { ServiceUnavailableException, UnauthorizedException, BadRequestException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env';
import type { ReviewService } from './review.service';
import { ReviewWebhookController } from './review-webhook.controller';

const SECRET = 'hook-secret';
const payload = {
  action: 'opened',
  repository: { full_name: 'acme/widgets' },
  pull_request: {
    number: 1,
    title: 't',
    html_url: 'u',
    user: { login: 'ada' },
    head: { sha: 'sha1' },
  },
};

function setup(secret: string | null = SECRET) {
  const reviews = { handlePullRequest: jest.fn().mockResolvedValue('started') };
  const config = { get: (key: string) => (key === 'GITHUB_WEBHOOK_SECRET' ? (secret ?? undefined) : undefined) } as unknown as ConfigService<Env, true>;
  const controller = new ReviewWebhookController(reviews as unknown as ReviewService, config);
  const signed = (body: unknown, key = SECRET) => {
    const rawBody = Buffer.from(JSON.stringify(body));
    return { request: { rawBody } as never, signature: `sha256=${createHmac('sha256', key).update(rawBody).digest('hex')}` };
  };
  return { controller, reviews, signed };
}

describe('ReviewWebhookController', () => {
  it('hands a correctly signed pull_request event to the review service', async () => {
    const { controller, reviews, signed } = setup();
    const { request, signature } = signed(payload);
    await expect(controller.receive(request, 'pull_request', signature, payload)).resolves.toEqual({ result: 'started' });
    expect(reviews.handlePullRequest).toHaveBeenCalledWith(expect.objectContaining({ action: 'opened' }));
  });

  it('rejects a wrong signature before looking at the payload', async () => {
    const { controller, reviews, signed } = setup();
    const { request, signature } = signed(payload, 'attacker-secret');
    await expect(controller.receive(request, 'pull_request', signature, payload)).rejects.toThrow(UnauthorizedException);
    await expect(controller.receive(request, 'pull_request', undefined, payload)).rejects.toThrow(UnauthorizedException);
    expect(reviews.handlePullRequest).not.toHaveBeenCalled();
  });

  it('is unavailable, not open, when no secret is configured', async () => {
    const { controller, signed } = setup(null);
    const { request, signature } = signed(payload);
    await expect(controller.receive(request, 'pull_request', signature, payload)).rejects.toThrow(ServiceUnavailableException);
  });

  it('answers the ping GitHub sends when the webhook is created, and ignores other events', async () => {
    const { controller, reviews, signed } = setup();
    const ping = { zen: 'Keep it logically awesome.' };
    const { request, signature } = signed(ping);
    await expect(controller.receive(request, 'ping', signature, ping)).resolves.toEqual({ result: 'pong' });
    await expect(controller.receive(request, 'issues', signature, ping)).resolves.toEqual({ result: 'ignored' });
    expect(reviews.handlePullRequest).not.toHaveBeenCalled();
  });

  it('rejects a signed pull_request payload it cannot read', async () => {
    const { controller, signed } = setup();
    const broken = { action: 'opened' };
    const { request, signature } = signed(broken);
    await expect(controller.receive(request, 'pull_request', signature, broken)).rejects.toThrow(BadRequestException);
  });
});
