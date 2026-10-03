import type { BountySort, BountyStatus } from '@escrow/shared';

const STATUSES: readonly string[] = ['open', 'in_review', 'payout_held', 'paid', 'closed'] satisfies BountyStatus[];

export interface BountyFilters {
  status: BountyStatus | undefined;
  sort: BountySort;
  q: string;
}

/** Filters live in the URL so a filtered view can be shared. Unknown values fall back to defaults. */
export function readFilters(params: URLSearchParams): BountyFilters {
  const status = params.get('status');
  return {
    status: status && STATUSES.includes(status) ? (status as BountyStatus) : undefined,
    sort: params.get('sort') === 'reward' ? 'reward' : 'newest',
    q: params.get('q') ?? '',
  };
}

export function writeFilters(params: URLSearchParams, patch: Partial<BountyFilters>): URLSearchParams {
  const next = new URLSearchParams(params);
  const merged = { ...readFilters(params), ...patch };
  if (merged.status) next.set('status', merged.status);
  else next.delete('status');
  if (merged.sort !== 'newest') next.set('sort', merged.sort);
  else next.delete('sort');
  if (merged.q.trim()) next.set('q', merged.q);
  else next.delete('q');
  return next;
}
