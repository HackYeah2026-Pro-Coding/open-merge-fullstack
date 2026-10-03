import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Bounty, BountyListQuery, CreateBountyInput, User } from '@escrow/shared';
import { api } from './index';

export const queryKeys = {
  session: ['session'] as const,
  organization: ['organization'] as const,
  stats: ['stats'] as const,
  activity: (repo?: string) => ['activity', repo ?? null] as const,
  repositories: ['repositories'] as const,
  repository: (name: string) => ['repository', name] as const,
  bounties: (query: BountyListQuery) => ['bounties', query] as const,
  bounty: (repo: string, issueNumber: number) => ['bounty', repo, issueNumber] as const,
  mySubmissions: ['me', 'submissions'] as const,
};

/** Everything a bounty's numbers feed into; refreshed after anything that changes them. */
const SUMMARY_KEYS = [['bounties'], ['bounty'], ['stats'], ['activity'], ['repositories'], ['repository']];

export function useSession() {
  return useQuery({ queryKey: queryKeys.session, queryFn: () => api.getSession(), staleTime: 60_000 });
}

export function useOrganization() {
  return useQuery({ queryKey: queryKeys.organization, queryFn: () => api.getOrganization(), staleTime: Infinity });
}

export function useStats() {
  return useQuery({ queryKey: queryKeys.stats, queryFn: () => api.getStats() });
}

export function useActivity(repo?: string) {
  return useQuery({ queryKey: queryKeys.activity(repo), queryFn: () => api.listActivity(repo) });
}

export function useRepositories() {
  return useQuery({ queryKey: queryKeys.repositories, queryFn: () => api.listRepositories() });
}

export function useRepository(name: string) {
  return useQuery({ queryKey: queryKeys.repository(name), queryFn: () => api.getRepository(name) });
}

export function useBounties(query: BountyListQuery) {
  return useQuery({
    queryKey: queryKeys.bounties(query),
    queryFn: () => api.listBounties(query),
    placeholderData: keepPreviousData,
  });
}

function hasPendingCheck(bounty: Bounty | undefined): boolean {
  return !!bounty?.submissions.some((s) => s.state === 'open' && s.check.state === 'pending');
}

export function useBounty(repo: string, issueNumber: number, options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: queryKeys.bounty(repo, issueNumber),
    queryFn: () => api.getBounty(repo, issueNumber),
    enabled: options.enabled,
    // Check results arrive asynchronously; poll only while one is outstanding.
    refetchInterval: (query) => (hasPendingCheck(query.state.data) ? 3_000 : false),
  });
}

export function useMySubmissions(enabled: boolean) {
  return useQuery({ queryKey: queryKeys.mySubmissions, queryFn: () => api.listMySubmissions(), enabled });
}

export function useCreateBounty() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateBountyInput) => api.createBounty(input),
    onSuccess: (bounty) => {
      client.setQueryData(queryKeys.bounty(bounty.repository.name, bounty.issue.number), bounty);
      for (const queryKey of SUMMARY_KEYS) void client.invalidateQueries({ queryKey });
    },
  });
}

/** Runs a failed AI review again; the bounty refetches and polls while the new run is pending. */
export function useRerunReview() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (reviewId: string) => api.rerunReview(reviewId),
    onSuccess: () => client.invalidateQueries({ queryKey: ['bounty'] }),
  });
}

/**
 * Who is signed in changed: drop per-user data and wait for the new session, so
 * callers can navigate as soon as the mutation settles.
 */
function useSwitchIdentity<TVariables>(mutationFn: (variables: TVariables) => Promise<void>) {
  const client = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: async () => {
      client.removeQueries({ queryKey: ['me'] });
      await client.invalidateQueries({ queryKey: queryKeys.session });
    },
  });
}

export function useSignIn() {
  return useSwitchIdentity((next: string) => api.signIn(next));
}

export function useOpenOwnerView() {
  return useSwitchIdentity(() => api.openOwnerView());
}

/**
 * Leaves the owner view if it is open, otherwise signs the developer out.
 * `leave` runs before the session is refetched, so the page can move off a
 * route that would otherwise redirect to sign-in first.
 */
export function useSignOut() {
  return useSwitchIdentity(async (leave: () => void) => {
    await api.signOut();
    leave();
  });
}

/** Stores the updated user after a wallet change and refreshes what depends on it. */
export function useApplyUser() {
  const client = useQueryClient();
  return (user: User) => {
    client.setQueryData(queryKeys.session, { user });
    // Linking a wallet can release held payouts, which moves every total.
    for (const queryKey of [['me'], ...SUMMARY_KEYS]) void client.invalidateQueries({ queryKey });
  };
}
