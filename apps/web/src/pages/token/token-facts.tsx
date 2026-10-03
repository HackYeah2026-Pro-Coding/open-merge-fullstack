import { ArrowUpRight } from 'lucide-react';
import { env } from '@/lib/env';
import { addressUrl } from '@/lib/explorer';
import { CopyButton } from '@/components/common/copy-button';

// Read from the mint account on chain.
const FACTS = [
  { label: 'Symbol', value: 'OMT', mono: true },
  { label: 'Network', value: `Solana ${env.solanaCluster}` },
  { label: 'Standard', value: 'Token-2022' },
];

/** The token's identity at a glance, with the mint address to copy or open in the explorer. */
export function TokenFacts() {
  return (
    <div className="rounded-lg border bg-surface-1">
      <dl className="grid grid-cols-3 gap-4 p-5">
        {FACTS.map((fact) => (
          <div key={fact.label} className="min-w-0">
            <dt className="label">{fact.label}</dt>
            <dd className={fact.mono ? 'data mt-1.5 font-medium text-fg' : 'mt-1.5 font-medium text-fg'}>{fact.value}</dd>
          </div>
        ))}
      </dl>
      <dl className="border-t p-5">
        <dt className="label">Mint address</dt>
        <dd className="mt-1.5 flex items-start gap-1">
          <span className="data min-w-0 pt-0.5 text-[13px] break-all text-fg-muted">{env.tokenMint}</span>
          <CopyButton value={env.tokenMint} label="mint address" />
          <a
            href={addressUrl(env.tokenMint)}
            target="_blank"
            rel="noreferrer"
            aria-label="Open the mint address in Solana Explorer"
            className="inline-flex size-6 shrink-0 items-center justify-center rounded-sm text-fg-subtle transition-colors duration-120 hover:bg-surface-2 hover:text-fg"
          >
            <ArrowUpRight className="size-3.5" />
          </a>
        </dd>
      </dl>
    </div>
  );
}
