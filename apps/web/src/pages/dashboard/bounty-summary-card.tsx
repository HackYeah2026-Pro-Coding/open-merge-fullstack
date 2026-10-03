import type { TokenAmount } from '@escrow/shared';
import { CircleDot } from 'lucide-react';
import { Amount } from '@/components/common/amount';
import { Labels } from '@/components/bounty/bounty-row';

type Props = { title: string; reward: TokenAmount | null; labels: string[]; repo: string };

/** Live summary of the bounty being written: how it will be listed and what creating it does. */
export function BountySummaryCard({ title, reward, labels, repo }: Props) {
  return (
    <section aria-label="Summary" className="rounded-lg border bg-surface-1">
      <div className="p-5 sm:p-6">
        <p className="label">Reward</p>
        {reward ? (
          <Amount value={reward} large className="mt-2 block text-[34px] leading-none font-medium tracking-[-0.02em]" />
        ) : (
          <p className="data mt-2 text-[34px] leading-none font-medium text-fg-subtle">—</p>
        )}
      </div>

      <div className="border-t p-5 sm:p-6">
        <p className="label mb-3">Listed as</p>
        <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 rounded-md border bg-bg px-4 py-3">
          <CircleDot className="mt-[3px] size-4 text-ok" aria-hidden />
          <div className="min-w-0">
            <p className={title.trim() ? 'font-medium break-words text-fg' : 'text-fg-subtle'}>{title.trim() || 'Untitled bounty'}</p>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[13px] text-fg-subtle">
              <span className="text-ok-text">Open</span>
              {labels.length > 0 && <Labels labels={labels} />}
            </div>
          </div>
        </div>
      </div>

      <dl className="space-y-3 border-t p-5 text-[13px] sm:p-6">
        <div className="flex justify-between gap-4">
          <dt className="text-fg-subtle">Repository</dt>
          <dd className="data truncate text-fg-muted" title={repo}>
            {repo}
          </dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-fg-subtle">GitHub issue</dt>
          <dd className="text-fg-muted">Opened on create</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-fg-subtle">Released</dt>
          <dd className="text-right text-fg-muted">On merge, to the author's wallet</dd>
        </div>
      </dl>
    </section>
  );
}
