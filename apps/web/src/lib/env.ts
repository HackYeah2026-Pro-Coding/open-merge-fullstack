/**
 * Build-time configuration from the root .env (VITE_* keys only).
 *
 * VITE_API_MODE   mock (default) runs entirely in the browser; http calls the NestJS /api.
 * VITE_GITHUB_REPO  owner/repo used by the mock; the real API reports its own.
 * VITE_SOLANA_CLUSTER  explorer cluster for transaction links.
 */
type ApiMode = 'mock' | 'http';

function readApiMode(): ApiMode {
  const raw = import.meta.env.VITE_API_MODE ?? 'mock';
  if (raw !== 'mock' && raw !== 'http') {
    throw new Error(`VITE_API_MODE must be "mock" or "http", got "${raw}"`);
  }
  return raw;
}

export const env = {
  apiMode: readApiMode(),
  githubRepo: import.meta.env.VITE_GITHUB_REPO ?? 'HackYeah2026-Pro-Coding/openmerge-sandbox',
  solanaCluster: import.meta.env.VITE_SOLANA_CLUSTER ?? 'devnet',
} as const;
