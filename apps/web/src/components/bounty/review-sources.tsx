import { useState } from 'react';
import type { ReviewSource, ReviewToolName } from '@escrow/shared';
import { cn } from '@/lib/cn';

const VERB: Record<ReviewToolName, string> = { read_file: 'read', search: 'search', list_dir: 'list' };
/** Shown before the rest is folded away; a long list would bury the verdict. */
const VISIBLE = 5;

/** What a reviewer read in the repository, recorded by the server as it happened. */
export function ReviewSources({ sources }: { sources: ReviewSource[] }) {
  const [expanded, setExpanded] = useState(false);
  const folded = sources.length > VISIBLE + 1 && !expanded;
  const shown = folded ? sources.slice(0, VISIBLE) : sources;

  return (
    <div className="mt-3">
      <p className="label">Looked at</p>
      <ul className="mt-1.5 space-y-0.5">
        {shown.map((source, i) => (
          <li key={`${i}-${source.tool}-${source.target}`} className="data text-[12px] text-fg-muted">
            <span className="text-fg-subtle">{VERB[source.tool]}</span>{' '}
            <span className={cn(!source.ok && 'text-fg-subtle')}>{source.target}</span>
            {!source.ok && <span className="text-fg-subtle"> (failed)</span>}
          </li>
        ))}
      </ul>
      {folded && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="mt-1 rounded-sm text-[12px] text-fg-muted transition-colors duration-120 hover:text-fg"
        >
          Show {sources.length - VISIBLE} more
        </button>
      )}
    </div>
  );
}
