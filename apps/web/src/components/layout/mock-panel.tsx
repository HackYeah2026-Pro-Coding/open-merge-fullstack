import { useState } from 'react';
import { useMatch } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { FlaskConical, GitMerge, GitPullRequestCreate, RotateCcw, X } from 'lucide-react';
import { toast } from 'sonner';
import { useBounty } from '@/api/queries';
import { getDb, resetDb } from '@/api/mock/db';
import { MOCK_DEVELOPER_ID } from '@/api/mock/seed';
import { simulateMerge, simulateOpenPullRequest } from '@/api/mock/simulate';
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

/**
 * Development-only controls for the in-browser mock: play the parts of GitHub
 * (pull requests, merges) that webhooks deliver in production.
 */
export function MockPanel() {
  const [open, setOpen] = useState(readOpen);
  const client = useQueryClient();
  const match = useMatch('/bounties/:repo/:number');
  const repo = match?.params.repo ?? '';
  const issueNumber = Number(match?.params.number);
  const bounty = useBounty(repo, issueNumber, { enabled: repo !== '' && Number.isInteger(issueNumber) });

  const toggle = (next: boolean) => {
    setOpen(next);
    writeOpen(next);
  };
  const refresh = () => client.invalidateQueries();

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

  const developer = getDb().users.find((u) => u.id === MOCK_DEVELOPER_ID);
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
          <p className="mt-1 text-fg-subtle">Stands in for GitHub webhooks and escrow.</p>
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

      {!bounty.data && <p className="mt-4 text-fg-subtle">Open a bounty to simulate pull requests and merges.</p>}

      {bounty.data && (
        <>
          <p className="mt-4 mb-2 font-medium text-fg-muted">
            Bounty{' '}
            <span className="data">
              {bounty.data.repository.name}#{bounty.data.issue.number}
            </span>
          </p>
          <div className="flex flex-col gap-1.5">
            {live && developer && (
              <Button
                size="sm"
                className="justify-start"
                onClick={() =>
                  run(`Pull request opened by @${developer.githubLogin}`, () => simulateOpenPullRequest(repo, issueNumber, developer))
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
                onClick={() => run(`Merged #${pr.prNumber}`, () => simulateMerge(repo, issueNumber, pr.prNumber))}
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
