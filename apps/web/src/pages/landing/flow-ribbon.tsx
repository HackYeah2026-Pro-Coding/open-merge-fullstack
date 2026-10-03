import type { ReactNode } from 'react';
import { CircleDot, GitMerge, GitPullRequest, ScanSearch, Vault, Wallet, type LucideIcon } from 'lucide-react';
import { Amount } from '@/components/common/amount';

const REWARD = { amount: '750000000', symbol: 'USDC', decimals: 6 };

const STEPS: { icon: LucideIcon; title: string; caption: ReactNode }[] = [
  { icon: CircleDot, title: 'Issue', caption: <span className="data">#12 posted</span> },
  { icon: Vault, title: 'Escrow', caption: 'Reward locked' },
  { icon: GitPullRequest, title: 'Pull request', caption: <span className="data">#43 opened</span> },
  { icon: ScanSearch, title: 'Review', caption: 'Claude · Gemini' },
  { icon: GitMerge, title: 'Merge', caption: <span className="data">a3f9c1e</span> },
  { icon: Wallet, title: 'Payout', caption: <Amount value={REWARD} /> },
];

// The pulse crosses the ribbon in 85% of a 6s cycle; each node lights up as it passes.
const nodeDelay = (i: number) => `${(i / (STEPS.length - 1)) * 0.85 * 6 - 0.18}s`;

function Pulse({ vertical }: { vertical?: boolean }) {
  return (
    <span
      aria-hidden
      className={
        vertical
          ? 'absolute left-1/2 h-8 w-[3px] -translate-x-1/2 -translate-y-full animate-ribbon-y rounded-full bg-linear-to-b from-transparent to-brand'
          : 'absolute top-1/2 h-[3px] w-10 -translate-x-full -translate-y-1/2 animate-ribbon-x rounded-full bg-linear-to-r from-transparent to-brand'
      }
    />
  );
}

/** Issue → escrow → pull request → review → merge → payout, with a pulse travelling along it. */
export function FlowRibbon() {
  return (
    <figure aria-label="How a bounty moves from issue to payout">
      {/* Horizontal, from md up. The line runs between the first and last icon centres. */}
      <div className="relative hidden md:block">
        <span aria-hidden className="absolute top-[18px] right-[calc(100%/6-18px)] left-[18px] h-px bg-border">
          <Pulse />
        </span>
        <ol className="relative grid grid-cols-6">
          {STEPS.map(({ icon: Icon, title, caption }, i) => (
            <li key={title} className="relative pr-4">
              <span
                className="flex size-9 animate-ribbon-node items-center justify-center rounded-sm border bg-bg text-fg-muted"
                style={{ animationDelay: nodeDelay(i) }}
              >
                <Icon className="size-4" aria-hidden />
              </span>
              <p className="mt-4 font-medium text-fg">{title}</p>
              <p className="mt-1 text-[13px] text-fg-subtle">{caption}</p>
            </li>
          ))}
        </ol>
      </div>

      {/* Vertical on small screens: equal row heights keep the pulse in step with the nodes. */}
      <div className="relative md:hidden">
        <span aria-hidden className="absolute top-[18px] bottom-[calc(64px-18px)] left-[17.5px] w-px bg-border">
          <Pulse vertical />
        </span>
        <ol className="relative">
          {STEPS.map(({ icon: Icon, title, caption }, i) => (
            <li key={title} className="relative flex h-16 gap-4">
              <span
                className="flex size-9 shrink-0 animate-ribbon-node items-center justify-center rounded-sm border bg-bg text-fg-muted"
                style={{ animationDelay: nodeDelay(i) }}
              >
                <Icon className="size-4" aria-hidden />
              </span>
              <div className="pt-0.5">
                <p className="font-medium text-fg">{title}</p>
                <p className="text-[13px] text-fg-subtle">{caption}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </figure>
  );
}
