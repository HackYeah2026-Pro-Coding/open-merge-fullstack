import { useState } from 'react';
import type { CiResult, CriterionStatus, ReviewerVerdict, Submission } from '@escrow/shared';
import { ArrowUpRight, Check, ChevronRight, CircleHelp, RotateCw, X } from 'lucide-react';
import { toast } from 'sonner';
import { useRerunReview } from '@/api/queries';
import { cn } from '@/lib/cn';
import { Button } from '@/components/ui/button';

const CRITERION: Record<CriterionStatus, { label: string; icon: typeof Check; className: string }> = {
  met: { label: 'Met', icon: Check, className: 'text-ok-text' },
  not_met: { label: 'Not met', icon: X, className: 'text-danger' },
  unknown: { label: 'Unknown', icon: CircleHelp, className: 'text-fg-subtle' },
};

function ciText(ci: CiResult): { text: string; className: string } {
  switch (ci.state) {
    case 'passed':
      return { text: 'CI passed', className: 'text-ok-text' };
    case 'failed':
      return { text: `CI failed: ${ci.failedJobs.join(', ')}`, className: 'text-danger' };
    case 'none':
      return { text: 'No CI ran for this commit, so nothing was executed', className: 'text-fg-muted' };
    case 'timeout':
      return { text: 'CI was still running when the review started', className: 'text-fg-muted' };
  }
}

function ReviewerColumn({ reviewer }: { reviewer: ReviewerVerdict }) {
  return (
    <div className="min-w-0 rounded-md border bg-surface-1 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <h4 className="font-medium text-fg">{reviewer.reviewer}</h4>
        {reviewer.model && <span className="data text-[12px] text-fg-subtle">{reviewer.model}</span>}
      </div>
      {reviewer.summary && (
        <p className={cn('mt-1.5 text-[13px]', reviewer.verdict === 'error' ? 'text-danger' : 'text-fg-muted')}>
          {reviewer.summary}
        </p>
      )}
      {reviewer.confidence && <p className="mt-1 text-[12px] text-fg-subtle">Confidence: {reviewer.confidence}</p>}
      {reviewer.criteria.length > 0 && (
        <ul className="mt-3 space-y-2">
          {reviewer.criteria.map((c) => {
            const { icon: Icon, label, className } = CRITERION[c.status];
            return (
              <li key={c.criterion} className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-2 text-[13px]">
                <Icon className={cn('mt-[3px] size-3.5', className)} aria-label={label} role="img" />
                <div className="min-w-0">
                  <p className="text-fg">{c.criterion}</p>
                  <p className="data break-words text-[12px] text-fg-subtle">{c.evidence}</p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {reviewer.risks.length > 0 && (
        <div className="mt-3">
          <p className="label">Risks</p>
          <ul className="mt-1.5 list-disc space-y-1 pl-4 text-[13px] text-fg-muted">
            {reviewer.risks.map((risk) => (
              <li key={risk}>{risk}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/** Both reviewers' answers for the head commit, the CI result, and the way on to merging. */
export function ReviewDetails({ submission, canRerun }: { submission: Submission; canRerun: boolean }) {
  const [open, setOpen] = useState(false);
  const rerun = useRerunReview();
  const { check, ci } = submission;
  if (check.state === 'not_run' || check.state === 'pending') return null;

  const onRerun = () => {
    if (!submission.retryableReviewId) return;
    rerun.mutate(submission.retryableReviewId, {
      onSuccess: () => toast.success('Review restarted', { description: 'Both reviewers look at this commit again.' }),
      onError: (error) => toast.error('Could not restart the review', { description: error.message }),
    });
  };

  const ciLine = ci ? ciText(ci) : null;
  return (
    <div className="mt-3">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1 rounded-sm text-[13px] text-fg-muted transition-colors duration-120 hover:text-fg"
      >
        <ChevronRight className={cn('size-3.5 transition-transform duration-120', open && 'rotate-90')} aria-hidden />
        Review details
      </button>
      {open && (
        <div className="mt-3 space-y-3">
          {ciLine && <p className={cn('text-[13px]', ciLine.className)}>{ciLine.text}</p>}
          <div className="grid gap-3 sm:grid-cols-2">
            {check.reviewers.map((r) => (
              <ReviewerColumn key={r.reviewer} reviewer={r} />
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            {submission.state === 'open' && (
              <Button asChild size="sm" variant={check.state === 'passed' ? 'primary' : 'secondary'}>
                <a href={submission.url} target="_blank" rel="noreferrer">
                  {check.state === 'passed' ? 'Merge on GitHub to release payment' : 'Open pull request'}
                  <ArrowUpRight />
                </a>
              </Button>
            )}
            {submission.retryableReviewId && canRerun && (
              <Button size="sm" pending={rerun.isPending} onClick={onRerun}>
                {!rerun.isPending && <RotateCw />}
                Re-run review
              </Button>
            )}
            <p className="text-[12px] text-fg-subtle">The review is advisory. You decide whether to merge.</p>
          </div>
        </div>
      )}
    </div>
  );
}
