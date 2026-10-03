import type { Bounty, BountyEvent, GithubActor } from '@escrow/shared';

export type StepState = 'done' | 'paid' | 'current' | 'upcoming' | 'held' | 'returned';

export interface EscrowStep {
  key: string;
  title: string;
  state: StepState;
  at: string | null;
  detail: string | null;
  actor: GithubActor | null;
  commitSha: string | null;
  txSignature: string | null;
}

function step(key: string, title: string, state: StepState, from?: BountyEvent, detail: string | null = null): EscrowStep {
  return {
    key,
    title,
    state,
    at: from?.at ?? null,
    detail,
    actor: from?.actor ?? null,
    commitSha: from?.commitSha ?? null,
    txSignature: from?.txSignature ?? null,
  };
}

/** The bounty's path from funded to paid, derived from its event log. */
export function escrowSteps(bounty: Pick<Bounty, 'events'>): EscrowStep[] {
  const first = (type: BountyEvent['type']) => bounty.events.find((e) => e.type === type);
  const funded = first('funded');
  const opened = first('pr_opened');
  const merged = first('merged');
  const paid = first('paid');
  const held = first('payout_held');
  const refunded = first('refunded');

  const steps: EscrowStep[] = [
    step('funded', 'Reward locked', funded ? 'done' : 'current', funded),
    opened
      ? step('pr', `Pull request #${opened.prNumber} opened`, 'done', opened, opened.actor ? `by @${opened.actor.login}` : null)
      : step('pr', 'Pull request', refunded ? 'upcoming' : 'current', undefined, 'Waiting for a pull request that references the issue'),
  ];

  if (refunded) {
    steps.push(step('returned', 'Returned to maintainer', 'returned', refunded, refunded.note));
    return steps;
  }

  steps.push(
    merged
      ? step('merged', `Pull request #${merged.prNumber} merged`, 'done', merged)
      : step('merged', 'Merge', opened ? 'current' : 'upcoming', undefined, 'Merging releases the reward'),
  );

  if (paid) {
    steps.push(step('paid', paid.actor ? `Paid to @${paid.actor.login}` : 'Paid', 'paid', paid));
  } else if (held) {
    steps.push(step('paid', 'Payout held', 'held', held, held.note));
  } else {
    steps.push(step('paid', 'Paid', 'upcoming', undefined, "Sent to the developer's linked wallet"));
  }
  return steps;
}
