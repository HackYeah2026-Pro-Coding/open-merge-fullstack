import { useState } from 'react';
import { useMatch } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { FlaskConical, GitMerge, GitPullRequestCreate, RotateCcw, X } from 'lucide-react';
import { toast } from 'sonner';
import { useBounty, useSession } from '@/api/queries';
import { getDb, resetDb } from '@/api/mock/db';
import { MOCK_DEVELOPER_ID, MOCK_MAINTAINER_ID } from '@/api/mock/seed';
import { setMockSession, simulateMerge, simulateOpenPullRequest } from '@/api/mock/simulate';
import { cn } from '@/lib/cn';
import { Button } from '@/components/ui/button';

const OPEN_KEY = 'openmerge.mock.panel';

function readOpen(): boolean {
  try {
    return localStorage.getItem(OPEN_KEY) === 'open';
  } catch {
    // Storage blocked: start collapsed, the toggle still works.
    return false;
  }
}

function writeOpen(open: boolean): void {
  try {
    localStorage.setItem(OPEN_KEY, open ? 'open' : 'closed');
  } catch (error) {
    console.warn('Could not remember mock panel state', error);
  }
}

const PERSONAS = [
  { id: null, label: 'Signed out' },
  { id: MOCK_MAINTAINER_ID, label: 'Maintainer' },
  { id: MOCK_DEVELOPER_ID, label: 'Developer' },
] as const;

/**
 * Development-only controls for the in-browser mock: switch who is signed in and
 * play the parts of GitHub (pull requests, merges) that webhooks deliver in production.
 */
export function MockPanel() {
  const [open, setOpen] = useState(readOpen);
  const client = useQueryClient();
  const session = useSession();
  const match = useMatch('/bounties/:number');
  const issueNumber = Number(match?.params.number);
  const bounty = useBounty(issueNumber, { enabled: Number.isInteger(issueNumber) });

  const toggle = (next: boolean) => {
    setOpen(next);
    writeOpen(next);
  };
  const refresh = () => client.invalidateQueries();
  const userId = session.data?.user?.id ?? null;

  const run = (label: string, action: () => void) => {
    action();
    void refresh();
    toast.success(label);
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => toggle(true)}
        className="fixed bottom-4 left-4 z-40 inline-flex h-8 items-center gap-1.5 rounded-full border bg-surface-1 px-3 text-[12px] font-medium text-fg-muted shadow-overlay transition-colors duration-120 hover:text-fg"
      >
        <FlaskConical className="size-3.5" />
        Mock
      </button>
    );
  }

  const developer = getDb().users.find((u) => u.id === (session.data?.user?.role === 'developer' ? userId : MOCK_DEVELOPER_ID));
  const live = bounty.data && (bounty.data.status === 'open' || bounty.data.status === 'in_review');
  const openPrs = bounty.data?.submissions.filter((s) => s.state === 'open') ?? [];

  return (
    <aside
      aria-label="Mock controls"
      className="fixed bottom-4 left-4 z-40 w-[calc(100%-32px)] max-w-72 rounded-lg border bg-surface-1 p-4 text-[13px] shadow-overlay"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="label">Mock API</p>
          <p className="mt-1 text-fg-subtle">Stands in for GitHub and escrow.</p>
        </div>
        <button
          type="button"
          onClick={() => toggle(false)}
          aria-label="Hide mock controls"
          className="rounded-sm p-1 text-fg-subtle transition-colors duration-120 hover:bg-surface-2 hover:text-fg"
        >
          <X className="size-3.5" />
        </button>
      </div>

      <p className="mt-4 mb-2 font-medium text-fg-muted">Session</p>
      <div className="grid grid-cols-3 gap-1 rounded-sm border bg-bg p-0.5">
        {PERSONAS.map((p) => (
          <button
            key={p.label}
            type="button"
            aria-pressed={userId === p.id}
            onClick={() => run(p.id ? `Signed in as ${p.label.toLowerCase()}` : 'Signed out', () => setMockSession(p.id))}
            className={cn(
              'h-7 rounded-[4px] text-[12px] font-medium transition-colors duration-120',
              userId === p.id ? 'bg-surface-2 text-fg' : 'text-fg-subtle hover:text-fg',
            )}
          >
            {p.label}
          </button>
        ))}
      </div>

      {bounty.data && (
        <>
          <p className="mt-4 mb-2 font-medium text-fg-muted">
            Bounty <span className="data">#{bounty.data.issue.number}</span>
          </p>
          <div className="flex flex-col gap-1.5">
            {live && developer && (
              <Button
                size="sm"
                className="justify-start"
                onClick={() =>
                  run(`Pull request opened by @${developer.githubLogin}`, () => simulateOpenPullRequest(issueNumber, developer))
                }
              >
                <GitPullRequestCreate />
                Open PR as @{developer.githubLogin}
              </Button>
            )}
            {openPrs.map((pr) => (
              <Button
                key={pr.id}
                size="sm"
                className="justify-start"
                onClick={() => run(`Merged #${pr.prNumber}`, () => simulateMerge(issueNumber, pr.prNumber))}
              >
                <GitMerge />
                Merge #{pr.prNumber} by @{pr.author.login}
              </Button>
            ))}
            {!live && openPrs.length === 0 && <p className="text-fg-subtle">Nothing to simulate on this bounty.</p>}
          </div>
        </>
      )}

      <Button
        size="sm"
        variant="ghost"
        className="mt-4 -ml-2"
        onClick={() =>
          run('Mock data reset', () => {
            resetDb();
          })
        }
      >
        <RotateCcw />
        Reset data
      </Button>
    </aside>
  );
}
