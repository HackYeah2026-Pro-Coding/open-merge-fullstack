import { createHmac } from 'node:crypto';
import { BadRequestException, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env';
import { MergeController } from './merge.controller';
import type { MergeService } from './merge.service';

const SECRET = 'hook-secret';
const payload = {
  action: 'closed',
  repository: { full_name: 'acme/widgets' },
  pull_request: {
    number: 1,
    title: 't',
    html_url: 'u',
    merged: true,
    user: { id: 1, login: 'ada' },
    head: { sha: 'sha1' },
  },
};

function setup(secret: string | null = SECRET) {
  const merges = { handleClosed: jest.fn().mockResolvedValue('releasing') };
  const config = { get: (key: string) => (key === 'GITHUB_WEBHOOK_SECRET' ? (secret ?? undefined) : undefined) } as unknown as ConfigService<Env, true>;
  const controller = new MergeController(merges as unknown as MergeService, config);
  const signed = (body: unknown, key = SECRET) => {
    const rawBody = Buffer.from(JSON.stringify(body));
    return { request: { rawBody } as never, signature: `sha256=${createHmac('sha256', key).update(rawBody).digest('hex')}` };
  };
  return { controller, merges, signed };
}

describe('MergeController', () => {
  it('hands a correctly signed pull_request event to the merge service', async () => {
    const { controller, merges, signed } = setup();
    const { request, signature } = signed(payload);
    await expect(controller.webhookHandler(request, 'pull_request', signature, payload)).resolves.toEqual({ result: 'releasing' });
    expect(merges.handleClosed).toHaveBeenCalledWith(expect.objectContaining({ action: 'closed' }));
  });

  it('rejects a forged or unsigned merge before it can move money', async () => {
    const { controller, merges, signed } = setup();
    const { request, signature } = signed(payload, 'attacker-secret');
    await expect(controller.webhookHandler(request, 'pull_request', signature, payload)).rejects.toThrow(UnauthorizedException);
    await expect(controller.webhookHandler(request, 'pull_request', undefined, payload)).rejects.toThrow(UnauthorizedException);
    expect(merges.handleClosed).not.toHaveBeenCalled();
  });

  it('is unavailable, not open, when no secret is configured', async () => {
    const { controller, signed } = setup(null);
    const { request, signature } = signed(payload);
    await expect(controller.webhookHandler(request, 'pull_request', signature, payload)).rejects.toThrow(ServiceUnavailableException);
  });

  it('answers a ping and ignores other events', async () => {
    const { controller, merges, signed } = setup();
    const ping = { zen: 'Keep it logically awesome.' };
    const { request, signature } = signed(ping);
    await expect(controller.webhookHandler(request, 'ping', signature, ping)).resolves.toEqual({ result: 'pong' });
    await expect(controller.webhookHandler(request, 'issues', signature, ping)).resolves.toEqual({ result: 'ignored' });
    expect(merges.handleClosed).not.toHaveBeenCalled();
  });

  it('rejects a pull_request payload it cannot read', async () => {
    const { controller, signed } = setup();
    const bad = { action: 'closed' };
    const { request, signature } = signed(bad);
    await expect(controller.webhookHandler(request, 'pull_request', signature, bad)).rejects.toThrow(BadRequestException);
  });
});
