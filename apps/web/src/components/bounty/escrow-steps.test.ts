import { describe, expect, it } from 'vitest';
import type { BountyEvent } from '@escrow/shared';
import { escrowSteps } from './escrow-steps';

const ev = (type: BountyEvent['type'], extra: Partial<BountyEvent> = {}): BountyEvent => ({
  type,
  at: '2026-10-01T10:00:00Z',
  actor: null,
  prNumber: null,
  commitSha: null,
  txSignature: null,
  note: null,
  ...extra,
});

const dev = { login: 'devon-ray', avatarUrl: null };

describe('escrowSteps', () => {
  it('waits for a pull request once funded', () => {
    const steps = escrowSteps({ events: [ev('funded', { txSignature: 'sig' })] });
    expect(steps.map((s) => [s.key, s.state])).toEqual([
      ['funded', 'done'],
      ['pr', 'current'],
      ['merged', 'upcoming'],
      ['paid', 'upcoming'],
    ]);
    expect(steps[0]?.txSignature).toBe('sig');
  });

  it('waits for the merge while a pull request is open', () => {
    const steps = escrowSteps({ events: [ev('funded'), ev('pr_opened', { prNumber: 43, actor: dev })] });
    expect(steps[1]).toMatchObject({ title: 'Pull request #43 opened', state: 'done', detail: 'by @devon-ray' });
    expect(steps[2]).toMatchObject({ key: 'merged', state: 'current' });
  });

  it('ends in paid with the payout transaction', () => {
    const steps = escrowSteps({
      events: [
        ev('funded'),
        ev('pr_opened', { prNumber: 43, actor: dev }),
        ev('merged', { prNumber: 43, commitSha: 'abc' }),
        ev('paid', { actor: dev, txSignature: 'payout' }),
      ],
    });
    expect(steps[2]).toMatchObject({ state: 'done', commitSha: 'abc' });
    expect(steps[3]).toMatchObject({ title: 'Paid to @devon-ray', state: 'paid', txSignature: 'payout' });
  });

  it('shows a held payout with its reason, and paid once released', () => {
    const held = [ev('funded'), ev('pr_opened', { prNumber: 1 }), ev('merged', { prNumber: 1 }), ev('payout_held', { note: 'No wallet' })];
    expect(escrowSteps({ events: held })[3]).toMatchObject({ state: 'held', detail: 'No wallet' });
    expect(escrowSteps({ events: [...held, ev('paid', { actor: dev })] })[3]).toMatchObject({ state: 'paid' });
  });

  it('replaces merge and payout with the return when the bounty is closed', () => {
    const steps = escrowSteps({ events: [ev('funded'), ev('refunded', { note: 'Not planned' })] });
    expect(steps.map((s) => [s.key, s.state])).toEqual([
      ['funded', 'done'],
      ['pr', 'upcoming'],
      ['returned', 'returned'],
    ]);
  });
});
