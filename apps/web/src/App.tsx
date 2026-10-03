import { useEffect, useState } from 'react';
import type { HealthResponse } from '@escrow/shared';

type Probe =
  | { state: 'loading' }
  | { state: 'ok'; data: HealthResponse }
  | { state: 'error'; message: string };

/**
 * Scaffold page. Its only job is to prove the whole chain is wired:
 * React -> Vite /api proxy -> NestJS -> Prisma -> Postgres, plus a type imported
 * from the shared workspace package.
 */
export function App() {
  const [probe, setProbe] = useState<Probe>({ state: 'loading' });

  useEffect(() => {
    const controller = new AbortController();

    fetch('/api/health', { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error(`API responded ${res.status} ${res.statusText}`);
        return (await res.json()) as HealthResponse;
      })
      .then((data) => setProbe({ state: 'ok', data }))
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setProbe({ state: 'error', message: error instanceof Error ? error.message : String(error) });
      });

    return () => controller.abort();
  }, []);

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-8 px-6">
      <header className="space-y-3">
        <p className="text-[11.5px] font-medium uppercase tracking-[0.07em] text-fg-subtle">
          Development scaffold
        </p>
        <h1 className="text-4xl font-semibold tracking-tight">Escrow</h1>
        <p className="text-fg-muted">
          Scaffold is up. Replace this page once the first feature lands.
        </p>
      </header>

      <section className="rounded-[10px] border bg-surface-1 p-5">
        <h2 className="mb-4 text-[11.5px] font-medium uppercase tracking-[0.07em] text-fg-subtle">
          API health
        </h2>

        {probe.state === 'loading' && <p className="text-sm text-fg-muted">Checking…</p>}

        {probe.state === 'error' && (
          <div className="space-y-2">
            <p className="text-sm text-danger">{probe.message}</p>
            <p className="text-sm text-fg-subtle">
              Is the API running? <code className="font-mono">pnpm dev</code> starts both, and{' '}
              <code className="font-mono">pnpm db:up</code> starts Postgres.
            </p>
          </div>
        )}

        {probe.state === 'ok' && (
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
            <dt className="text-fg-subtle">Status</dt>
            <dd className="font-mono text-ok">{probe.data.status}</dd>
            <dt className="text-fg-subtle">Database</dt>
            <dd className="font-mono text-ok">{probe.data.database}</dd>
            <dt className="text-fg-subtle">Uptime</dt>
            <dd className="font-mono tabular-nums">{probe.data.uptimeSeconds}s</dd>
          </dl>
        )}
      </section>

      <button
        type="button"
        onClick={() => {
          const root = document.documentElement;
          root.dataset.theme = root.dataset.theme === 'light' ? 'dark' : 'light';
        }}
        className="self-start rounded-[8px] border bg-surface-2 px-3 py-1.5 text-sm transition-colors duration-120 hover:bg-surface-1"
      >
        Toggle theme
      </button>
    </main>
  );
}
