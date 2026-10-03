import { BadRequestException } from '@nestjs/common';
import { MergeController } from './merge.controller';

const event = (action: string, merged?: boolean) => ({
  action,
  repository: { full_name: 'acme/widgets' },
  pull_request: { number: 1, merged },
});

describe('MergeController', () => {
  const controller = new MergeController();

  it('passes through a merged pull request untouched', () => {
    const merged = event('closed', true);
    expect(controller.webhookHandler('pull_request', merged)).toEqual(merged);
  });

  it('ignores a pull request closed without merging', () => {
    expect(controller.webhookHandler('pull_request', event('closed', false))).toEqual({ result: 'ignored' });
  });

  it('ignores every other pull request action', () => {
    for (const action of ['opened', 'synchronize', 'reopened', 'edited']) {
      expect(controller.webhookHandler('pull_request', event(action))).toEqual({ result: 'ignored' });
    }
  });

  it('ignores events that are not pull requests', () => {
    expect(controller.webhookHandler('ping', { zen: 'Keep it logically awesome.' })).toEqual({ result: 'ignored' });
    expect(controller.webhookHandler(undefined, event('closed', true))).toEqual({ result: 'ignored' });
  });

  it('rejects a pull_request payload it cannot read', () => {
    expect(() => controller.webhookHandler('pull_request', { action: 'closed' })).toThrow(BadRequestException);
  });
});
