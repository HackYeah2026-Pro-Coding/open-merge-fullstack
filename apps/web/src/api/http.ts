import type { BountyListQuery } from '@escrow/shared';
import { ApiError, type ApiClient } from './client';

interface ErrorBody {
  message?: string | string[];
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`/api${path}`, {
    credentials: 'include',
    ...init,
    headers: { Accept: 'application/json', ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...init.headers },
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as ErrorBody;
    const message = Array.isArray(body.message) ? body.message.join(', ') : body.message;
    throw new ApiError(res.status, message ?? `${res.status} ${res.statusText}`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

function toSearch(query: BountyListQuery): string {
  const params = new URLSearchParams();
  if (query.status) params.set('status', query.status);
  if (query.q) params.set('q', query.q);
  if (query.sort) params.set('sort', query.sort);
  const search = params.toString();
  return search ? `?${search}` : '';
}

export const httpApi: ApiClient = {
  getSession: () => request('/auth/session'),
  signIn: async (next) => {
    window.location.assign(`/api/auth/github?next=${encodeURIComponent(next)}`);
  },
  signOut: () => request('/auth/sign-out', { method: 'POST' }),

  getProject: () => request('/project'),
  getStats: () => request('/project/stats'),
  listActivity: () => request('/project/activity'),

  listBounties: (query) => request(`/bounties${toSearch(query)}`),
  getBounty: (issueNumber) => request(`/bounties/${issueNumber}`),
  createBounty: (input) => request('/bounties', { method: 'POST', body: JSON.stringify(input) }),

  listMySubmissions: () => request('/me/submissions'),
  createWalletChallenge: (address) =>
    request('/me/wallet/challenge', { method: 'POST', body: JSON.stringify({ address }) }),
  linkWallet: (input) => request('/me/wallet', { method: 'PUT', body: JSON.stringify(input) }),
  unlinkWallet: () => request('/me/wallet', { method: 'DELETE' }),
};
