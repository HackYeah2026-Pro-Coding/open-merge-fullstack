/**
 * Build-time configuration from the root .env (VITE_* keys only).
 *
 * VITE_API_MODE   mock (default) runs entirely in the browser; http calls the NestJS /api.
 * VITE_GITHUB_ORG  GitHub organization the mock serves; the real API reports its own.
 * VITE_SOLANA_CLUSTER  explorer cluster for transaction links.
 * VITE_TOKEN_MINT  mint of the reward token (OMT), shown on the token page. Must live on that cluster.
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
  githubOrg: import.meta.env.VITE_GITHUB_ORG ?? 'HackYeah2026-Pro-Coding',
  solanaCluster: import.meta.env.VITE_SOLANA_CLUSTER ?? 'devnet',
  tokenMint: import.meta.env.VITE_TOKEN_MINT ?? '9tBiUuzd6E3JAwKcdPW26CicHYvcPKvazVvRJjEZPQa9',
} as const;
