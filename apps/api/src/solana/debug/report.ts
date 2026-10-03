/** One assertion about chain state; values are strings so the report serialises as JSON. */
export interface Check {
  name: string;
  expected: string;
  actual: string;
  pass: boolean;
}

export type StepName = 'preflight' | 'create_and_deposit' | 'release';

export interface StepReport {
  step: StepName;
  ok: boolean;
  signature?: string;
  explorerUrl?: string;
  checks: Check[];
  /** Why the step stopped before its checks could run. */
  error?: string;
  durationMs: number;
}

export interface RoundtripReport {
  ok: boolean;
  developerWallet: string;
  amount: { baseUnits: string; display: string };
  escrowAddress: string | null;
  escrowUrl: string | null;
  vaultAddress: string | null;
  steps: StepReport[];
}

export interface StatusReport {
  ok: boolean;
  /** Host only: provider URLs carry API keys in the path or query. */
  rpcHost: string;
  programId: string;
  programDeployed: boolean;
  tokenMint: string;
  tokenProgram: string;
  decimals: number;
  serverWallet: { address: string; sol: string; tokens: string; tokensBaseUnits: string };
  verifier: { address: string; sol: string };
  /** What has to be fixed before an escrow can be locked and released. */
  issues: string[];
}

/** A check that passes when `expected` and `actual` are equal, unless `pass` says otherwise. */
export function check(name: string, expected: unknown, actual: unknown, pass?: boolean): Check {
  const e = String(expected);
  const a = String(actual);
  return { name, expected: e, actual: a, pass: pass ?? e === a };
}

/** Base units as a decimal string: 20000000 with 6 decimals is "20". */
export function formatUnits(baseUnits: bigint, decimals: number): string {
  if (decimals === 0) return baseUnits.toString();
  const digits = baseUnits.toString().padStart(decimals + 1, '0');
  const whole = digits.slice(0, -decimals);
  const fraction = digits.slice(-decimals).replace(/0+$/, '');
  return fraction ? `${whole}.${fraction}` : whole;
}

export function rpcHost(rpcUrl: string): string {
  return new URL(rpcUrl).host;
}

/** Explorer link on the cluster the RPC URL points at. */
export function explorerUrl(kind: 'tx' | 'address', value: string, rpcUrl: string): string {
  const host = rpcHost(rpcUrl);
  const cluster = host.includes('devnet')
    ? '?cluster=devnet'
    : host.includes('testnet')
      ? '?cluster=testnet'
      : host.includes('mainnet')
        ? ''
        : `?cluster=custom&customUrl=${encodeURIComponent(new URL(rpcUrl).origin)}`;
  return `https://explorer.solana.com/${kind}/${value}${cluster}`;
}

export function messageOf(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).slice(0, 500);
}
