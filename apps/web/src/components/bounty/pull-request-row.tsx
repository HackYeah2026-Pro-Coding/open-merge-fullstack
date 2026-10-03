import type { Submission } from '@escrow/shared';
import { ArrowUpRight } from 'lucide-react';
import { cn } from '@/lib/cn';
import { shortSha } from '@/lib/format';
import { Avatar } from '@/components/ui/avatar';
import { KeyValue } from '@/components/common/key-value';
import { RelativeTime } from '@/components/common/relative-time';
import { PR_STATE, toneText } from './status';
import { VerdictPill } from './verdict-pill';

/** A pull request submitted against a bounty, with the check on its head commit. */
export function PullRequestRow({ submission }: { submission: Submission }) {
  const state = PR_STATE[submission.state];
  const Icon = state.icon;
  return (
    <li className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 px-4 py-4 sm:px-5">
      <Icon className={cn('mt-[3px] size-4', toneText[state.tone])} aria-label={`${state.label} pull request`} role="img" />
      <div className="min-w-0">
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
          <a
            href={submission.url}
            target="_blank"
            rel="noreferrer"
            className="group inline-flex min-w-0 items-start gap-1 font-medium text-fg hover:underline hover:underline-offset-4"
          >
            <span className="min-w-0 break-words">{submission.title}</span>
            <ArrowUpRight className="mt-0.5 size-3.5 shrink-0 text-fg-subtle transition-colors duration-120 group-hover:text-fg" aria-hidden />
          </a>
          <VerdictPill check={submission.check} />
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-fg-subtle">
          <span className="data text-fg-muted">#{submission.prNumber}</span>
          <span aria-hidden>·</span>
          <span className="inline-flex items-center gap-1.5">
            <Avatar login={submission.author.login} src={submission.author.avatarUrl} size={16} />
            <span className="text-fg-muted">{submission.author.login}</span>
          </span>
          <span aria-hidden>·</span>
          <span className="inline-flex items-center gap-1">
            head <KeyValue value={submission.headSha} label="commit hash" display={shortSha(submission.headSha)} />
          </span>
          <span aria-hidden>·</span>
          <span>
            updated <RelativeTime iso={submission.updatedAt} />
          </span>
        </div>
      </div>
    </li>
  );
}
