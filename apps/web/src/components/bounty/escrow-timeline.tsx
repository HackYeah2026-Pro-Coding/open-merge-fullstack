import { Check, Clock, Undo2 } from 'lucide-react';
import { cn } from '@/lib/cn';
import { shortSha } from '@/lib/format';
import { txUrl } from '@/lib/explorer';
import { KeyValue } from '@/components/common/key-value';
import { RelativeTime } from '@/components/common/relative-time';
import type { EscrowStep, StepState } from './escrow-steps';

const NODE: Record<StepState, string> = {
  done: 'border-ok/40 bg-ok/12 text-ok',
  paid: 'border-brand/50 bg-brand/15 text-brand',
  current: 'border-brand/60 bg-bg text-brand',
  upcoming: 'border-dashed border-border bg-bg text-fg-subtle',
  held: 'border-warn/50 bg-warn/12 text-warn',
  returned: 'border-border bg-surface-2 text-fg-muted',
};

function Node({ state }: { state: StepState }) {
  return (
    <span className={cn('relative z-10 flex size-[22px] items-center justify-center rounded-full border', NODE[state])}>
      {(state === 'done' || state === 'paid') && <Check className="size-3" strokeWidth={3} />}
      {state === 'held' && <Clock className="size-3" strokeWidth={2.5} />}
      {state === 'returned' && <Undo2 className="size-3" strokeWidth={2.5} />}
      {state === 'current' && (
        <>
          <span className="absolute inset-0 animate-ping rounded-full border border-brand/40 [animation-duration:2s]" aria-hidden />
          <span className="size-1.5 rounded-full bg-brand" />
        </>
      )}
    </span>
  );
}

const STATE_LABEL: Record<StepState, string> = {
  done: 'done',
  paid: 'done',
  current: 'in progress',
  upcoming: 'not yet',
  held: 'held',
  returned: 'returned',
};

/** Vertical timeline from funded to paid. */
export function EscrowTimeline({ steps }: { steps: EscrowStep[] }) {
  return (
    <ol className="relative">
      {steps.map((s, i) => {
        const last = i === steps.length - 1;
        const reached = s.state !== 'upcoming' && s.state !== 'current';
        return (
          <li key={s.key} className="relative grid grid-cols-[22px_minmax(0,1fr)] gap-x-3 pb-4 last:pb-0">
            {!last && (
              <span
                aria-hidden
                className={cn('absolute top-[22px] bottom-0 left-[10.5px] w-px', reached ? 'bg-ok/35' : 'bg-border')}
              />
            )}
            <Node state={s.state} />
            <div className="min-w-0 pt-px">
              <p className={cn('font-medium', s.state === 'upcoming' ? 'text-fg-subtle' : 'text-fg')}>
                {s.title}
                <span className="sr-only">, {STATE_LABEL[s.state]}</span>
              </p>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[13px] text-fg-subtle">
                {s.at && <RelativeTime iso={s.at} />}
                {s.detail && <span className={cn(s.state === 'held' && 'text-warn')}>{s.detail}</span>}
                {s.commitSha && (
                  <KeyValue value={s.commitSha} label="merge commit hash" display={shortSha(s.commitSha)} />
                )}
                {s.txSignature && (
                  <KeyValue value={s.txSignature} label="transaction signature" href={txUrl(s.txSignature)} />
                )}
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
